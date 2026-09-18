import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EskizError, EskizService } from "../../common/sms/eskiz.service";
import { countSmsParts, normalizePhone } from "../../common/sms/phone";
import { findUnresolved, mapTemplateStatus, renderTemplate } from "../../common/sms/templates";
import { ParentsService } from "../parents/parents.service";
import type { CreateTemplateDto, BroadcastDto } from "./dto/sms.dto";

// Цена одной части СМС в сумах. Только для предварительной оценки в
// интерфейсе: фактическую сумму возвращает шлюз и она пишется в журнал.
const PART_PRICE = 340;

// Eskiz-статусы → наш enum. DELIVRD — не опечатка, это код SMPP.
const STATUS_MAP: Record<string, "DELIVERED" | "FAILED" | "SENT"> = {
  DELIVRD: "DELIVERED",
  DELIVERED: "DELIVERED",
  UNDELIV: "FAILED",
  REJECTD: "FAILED",
  EXPIRED: "FAILED",
  UNKNOWN: "FAILED",
  FAILED: "FAILED",
};

/** Перенесено из src/actions/sms-actions.ts и src/lib/sms/notify.ts в web. */
@Injectable()
export class SmsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly eskiz: EskizService,
    private readonly parents: ParentsService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Секрет в адресе приёма статусов. Раньше адрес был открыт, и кто угодно
   * мог переписать статусы доставки в журнале, за который платят деньги
   * (аудит 2.7). Секрет выводится из INTERNAL_TOKEN: отдельной переменной
   * окружения не нужно, а значение стабильно между перезапусками.
   */
  callbackSecret(): string {
    const base = process.env.INTERNAL_TOKEN ?? "";
    return createHash("sha256").update(`${base}:sms-callback`).digest("hex").slice(0, 32);
  }

  /**
   * Адрес, куда Eskiz присылает статус доставки. Без него журнал остался бы
   * в состоянии SENT навсегда — дошло сообщение или нет, было бы неизвестно.
   */
  private callbackUrl(): string | undefined {
    const base = process.env.APP_URL;
    if (!base) return undefined;
    return `${base.replace(/\/$/, "")}/api/v2/sms/callback/${this.callbackSecret()}`;
  }

  async account() {
    if (!this.eskiz.isConfigured()) return null;

    const account = await this.eskiz.getAccount();
    return {
      ...account,
      // role: "test" — шлюз примет только номера, привязанные к аккаунту
      isTestMode: account.role.toLowerCase() === "test",
    };
  }

  templates() {
    return this.prisma.smsTemplate.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  /** Подтягивает шаблоны из Eskiz: платформа показывает их копии и статусы. */
  async syncTemplates(actor: SessionUser) {
    this.requireConfigured();

    const remote = await this.eskiz.listTemplates();
    let created = 0;
    let updated = 0;

    for (const template of remote) {
      const status = mapTemplateStatus(template.status);
      const text = template.original_text || template.template || "";
      const existing = await this.prisma.smsTemplate.findUnique({
        where: { eskizId: template.id },
      });

      if (existing) {
        await this.prisma.smsTemplate.update({
          where: { id: existing.id },
          data: { status, syncedAt: new Date() },
        });
        updated += 1;
      } else {
        await this.prisma.smsTemplate.create({
          data: {
            eskizId: template.id,
            // Заголовок — первые слова текста: у Eskiz своего имени нет,
            // администратор потом переименует по-человечески.
            title: text.slice(0, 60) || `Shablon ${template.id}`,
            textRu: text,
            textUz: text,
            status,
            syncedAt: new Date(),
          },
        });
        created += 1;
      }
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "SmsTemplate",
      entityId: "sync",
      action: "UPDATE",
      metadata: { created, updated },
    });

    return { created, updated };
  }

  /** Заводит шаблон на платформе и сразу подаёт его на модерацию в Eskiz. */
  async createTemplate(data: CreateTemplateDto, actor: SessionUser) {
    const template = await this.prisma.smsTemplate.create({
      data: {
        title: data.title.trim(),
        textRu: data.textRu.trim(),
        textUz: data.textUz.trim(),
        status: "DRAFT",
      },
    });

    let submitError: string | null = null;
    if (data.submitToEskiz && this.eskiz.isConfigured()) {
      try {
        await this.eskiz.submitTemplate(data.textRu.trim());
        await this.prisma.smsTemplate.update({
          where: { id: template.id },
          data: { status: "MODERATION" },
        });
      } catch (error) {
        // Шаблон остаётся черновиком: подать его можно повторно, терять
        // введённый текст из-за сбоя шлюза незачем.
        submitError = error instanceof EskizError ? error.message : String(error);
      }
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "SmsTemplate",
      entityId: template.id,
      action: "CREATE",
      metadata: { title: template.title, submitted: Boolean(data.submitToEskiz) },
    });

    return { id: template.id, submitError };
  }

  /** Предпросмотр: кому, каким текстом и почём — до списания денег. */
  async previewBroadcast(params: BroadcastDto) {
    return this.buildPlan(params);
  }

  async sendBroadcast(params: BroadcastDto, actor: SessionUser) {
    this.requireConfigured();

    const plan = await this.buildPlan(params);

    // Несогласованный шаблон шлюз отобьёт, а попытка уже стоит денег
    if (plan.templateStatus !== "APPROVED") {
      throw new BadRequestException("templateNotApproved");
    }

    const sendable = plan.recipients.filter(
      (recipient) => recipient.normalizedPhone && recipient.unresolved.length === 0
    );
    if (sendable.length === 0) throw new BadRequestException("noRecipients");

    const dispatchId = randomUUID();

    // Журнал заполняем до отправки: если шлюз ответит ошибкой, останется
    // след, кому пытались отправить и почему не вышло.
    const broadcast = await this.prisma.smsBroadcast.create({
      data: {
        dispatchId,
        templateId: params.templateId,
        groupId: params.groupId,
        createdById: actor.id,
        total: sendable.length,
      },
      select: { id: true },
    });

    const messages = sendable.map((recipient) => ({
      userSmsId: randomUUID(),
      phone: recipient.normalizedPhone as string,
      text: recipient.text,
    }));

    await this.prisma.smsLog.createMany({
      data: messages.map((message, index) => ({
        phone: message.phone,
        text: message.text,
        status: "QUEUED" as const,
        userSmsId: message.userSmsId,
        parts: sendable[index].parts,
        userId: sendable[index].parentId,
        broadcastId: broadcast.id,
      })),
    });

    try {
      await this.eskiz.sendBatch({ messages, dispatchId, callbackUrl: this.callbackUrl() });
      await this.prisma.smsLog.updateMany({
        where: { broadcastId: broadcast.id },
        data: { status: "SENT" },
      });
    } catch (error) {
      const message = error instanceof EskizError ? error.message : String(error);
      await this.prisma.smsLog.updateMany({
        where: { broadcastId: broadcast.id },
        data: { status: "FAILED", error: message.slice(0, 500) },
      });
      throw new BadRequestException(message);
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "SmsBroadcast",
      entityId: broadcast.id,
      action: "CREATE",
      metadata: { groupId: params.groupId, total: sendable.length, dispatchId },
    });

    return { broadcastId: broadcast.id, sent: sendable.length };
  }

  async log(limit = 50) {
    const [messages, broadcasts] = await Promise.all([
      this.prisma.smsLog.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          phone: true,
          text: true,
          status: true,
          parts: true,
          price: true,
          error: true,
          createdAt: true,
          deliveredAt: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.smsBroadcast.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          total: true,
          createdAt: true,
          group: { select: { name: true } },
          template: { select: { title: true } },
          createdBy: { select: { firstName: true, lastName: true } },
          _count: { select: { messages: true } },
        },
      }),
    ]);

    const delivered = await this.prisma.smsLog.groupBy({
      by: ["broadcastId", "status"],
      where: { broadcastId: { in: broadcasts.map((broadcast) => broadcast.id) } },
      _count: true,
    });

    return { messages, broadcasts, delivered };
  }

  /**
   * Приём статуса доставки от Eskiz. Строка журнала находится по user_sms_id —
   * его мы сами выдаём при отправке.
   */
  async applyDeliveryStatus(body: {
    user_sms_id?: string;
    message_id?: string;
    status?: string;
    sms_count?: string | number;
  }) {
    const userSmsId = body.user_sms_id;
    if (!userSmsId) return { ok: true, skipped: "no user_sms_id" };

    const mapped = STATUS_MAP[(body.status ?? "").toUpperCase()];
    const parts = body.sms_count === undefined ? undefined : Number(body.sms_count);

    await this.prisma.smsLog.updateMany({
      where: { userSmsId },
      data: {
        status: mapped ?? "SENT",
        providerId: body.message_id ?? undefined,
        parts: Number.isFinite(parts) ? parts : undefined,
        deliveredAt: mapped === "DELIVERED" ? new Date() : undefined,
        error: mapped === "FAILED" ? (body.status ?? "unknown") : undefined,
      },
    });

    return { ok: true };
  }

  /**
   * Одно сообщение мимо рассылки: молча выходит, если канал не настроен, и
   * не пробрасывает ошибку — уведомление не должно ронять операцию, ради
   * которой его посылают. Всё пишется в SmsLog: СМС стоят денег.
   */
  async sendOne(params: {
    phone: string | null | undefined;
    text: string;
    userId?: string | null;
    broadcastId?: string | null;
  }): Promise<{ sent: boolean; reason?: string }> {
    if (!this.eskiz.isConfigured()) return { sent: false, reason: "notConfigured" };

    const phone = normalizePhone(params.phone);
    if (!phone) {
      // Кривой номер логируем: иначе получатель молча выпадет из рассылки
      await this.logFailure(params, "invalidPhone");
      return { sent: false, reason: "invalidPhone" };
    }

    const text = params.text.trim();
    if (!text) return { sent: false, reason: "emptyText" };

    const userSmsId = randomUUID();
    const { parts } = countSmsParts(text);

    const log = await this.prisma.smsLog.create({
      data: {
        phone,
        text,
        status: "QUEUED",
        userSmsId,
        parts,
        userId: params.userId ?? null,
        broadcastId: params.broadcastId ?? null,
      },
      select: { id: true },
    });

    try {
      const result = await this.eskiz.sendOne({
        phone,
        text,
        userSmsId,
        callbackUrl: this.callbackUrl(),
      });
      await this.prisma.smsLog.update({
        where: { id: log.id },
        data: { status: "SENT", providerId: result.id },
      });
      return { sent: true };
    } catch (error) {
      const message = error instanceof EskizError ? error.message : String(error);
      await this.prisma.smsLog.update({
        where: { id: log.id },
        data: { status: "FAILED", error: message.slice(0, 500) },
      });
      return { sent: false, reason: "providerError" };
    }
  }

  private async logFailure(
    params: { phone?: string | null; text: string; userId?: string | null; broadcastId?: string | null },
    error: string
  ) {
    await this.prisma.smsLog
      .create({
        data: {
          phone: params.phone?.trim() || "—",
          text: params.text.slice(0, 500),
          status: "FAILED",
          error,
          userId: params.userId ?? null,
          broadcastId: params.broadcastId ?? null,
        },
      })
      .catch(() => undefined);
  }

  private requireConfigured() {
    if (!this.eskiz.isConfigured()) throw new BadRequestException("smsNotConfigured");
  }

  /** План рассылки: кому, каким текстом и почём. */
  private async buildPlan(params: BroadcastDto) {
    const [group, template, parents] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: params.groupId },
        select: { id: true, name: true, course: { select: { title: true } } },
      }),
      this.prisma.smsTemplate.findUnique({ where: { id: params.templateId } }),
      this.parents.groupRecipients(params.groupId),
    ]);

    if (!group) throw new NotFoundException("groupNotFound");
    if (!template) throw new NotFoundException("templateNotFound");

    const raw = params.locale === "uz" ? template.textUz : template.textRu;

    const recipients = parents.recipients.map((recipient) => {
      const text = renderTemplate(raw, {
        parent: recipient.parent.firstName,
        student: recipient.children.map((child) => child.firstName).join(", "),
        group: group.name,
        course: group.course.title,
        center: "Best Direction",
        ...params.values,
      });
      const { parts, unicode } = countSmsParts(text);
      return {
        parentId: recipient.parent.id,
        name: `${recipient.parent.lastName} ${recipient.parent.firstName}`,
        phone: recipient.parent.phone,
        normalizedPhone: normalizePhone(recipient.parent.phone),
        children: recipient.children.map((child) => `${child.lastName} ${child.firstName}`),
        text,
        parts,
        unicode,
        unresolved: findUnresolved(text),
      };
    });

    const sendable = recipients.filter(
      (recipient) => recipient.normalizedPhone && recipient.unresolved.length === 0
    );
    const totalParts = sendable.reduce((sum, recipient) => sum + recipient.parts, 0);

    return {
      groupName: group.name,
      templateStatus: template.status,
      recipients,
      sendableCount: sendable.length,
      skipped: recipients.filter(
        (recipient) => !recipient.normalizedPhone || recipient.unresolved.length > 0
      ),
      withoutPhoneCount: parents.withoutPhone.length,
      studentCount: parents.studentCount,
      totalParts,
      estimatedCost: totalParts * PART_PRICE,
    };
  }
}
