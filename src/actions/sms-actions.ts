"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";
import {
  EskizError,
  getAccount,
  isEskizConfigured,
  listTemplates,
  sendBatch,
  submitTemplate,
} from "@/lib/sms/eskiz";
import { callbackUrl } from "@/lib/sms/notify";
import { countSmsParts, normalizePhone } from "@/lib/sms/phone";
import { findUnresolved, mapTemplateStatus, renderTemplate } from "@/lib/sms/templates";
import { getGroupParents } from "@/actions/parent-actions";

// Цена одной части СМС в сумах. Только для предварительной оценки в
// интерфейсе: фактическую сумму возвращает шлюз и она пишется в журнал.
const PART_PRICE = 340;

// ---------- getSmsAccount ----------
export async function getSmsAccount() {
  return withAuth(
    async () => {
      if (!isEskizConfigured()) {
        return { success: true as const, data: null };
      }
      try {
        const account = await getAccount();
        return {
          success: true as const,
          data: {
            ...account,
            // role: "test" — шлюз примет только номера, привязанные к аккаунту
            isTestMode: account.role.toLowerCase() === "test",
          },
        };
      } catch (error) {
        const message = error instanceof EskizError ? error.message : String(error);
        return { success: false as const, error: message };
      }
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- syncTemplates ----------
/** Подтягивает шаблоны из Eskiz: платформа показывает их копии и статусы. */
export async function syncTemplates() {
  return withAuth(
    async (session) => {
      if (!isEskizConfigured()) return { success: false as const, error: "smsNotConfigured" };

      try {
        const remote = await listTemplates();
        let created = 0;
        let updated = 0;

        for (const tpl of remote) {
          const status = mapTemplateStatus(tpl.status);
          const text = tpl.original_text || tpl.template || "";
          const existing = await prisma.smsTemplate.findUnique({ where: { eskizId: tpl.id } });

          if (existing) {
            await prisma.smsTemplate.update({
              where: { id: existing.id },
              data: { status, syncedAt: new Date() },
            });
            updated += 1;
          } else {
            await prisma.smsTemplate.create({
              data: {
                eskizId: tpl.id,
                // Заголовок — первые слова текста: у Eskiz своего имени нет,
                // администратор потом переименует по-человечески.
                title: text.slice(0, 60) || `Shablon ${tpl.id}`,
                textRu: text,
                textUz: text,
                status,
                syncedAt: new Date(),
              },
            });
            created += 1;
          }
        }

        await createAuditLog({
          userId: session.user.id,
          entityType: "SmsTemplate",
          entityId: "sync",
          action: "UPDATE",
          metadata: { created, updated },
        });

        revalidateLocalized("/admin/sms");
        return { success: true as const, data: { created, updated } };
      } catch (error) {
        const message = error instanceof EskizError ? error.message : String(error);
        return { success: false as const, error: message };
      }
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getTemplates ----------
export async function getTemplates() {
  return withAuth(
    async () => {
      const templates = await prisma.smsTemplate.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
      return { success: true as const, data: templates };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- createTemplate ----------
/** Заводит шаблон на платформе и сразу подаёт его на модерацию в Eskiz. */
export async function createTemplate(data: {
  title: string;
  textRu: string;
  textUz: string;
  submitToEskiz?: boolean;
}) {
  return withAuth(
    async (session) => {
      const template = await prisma.smsTemplate.create({
        data: {
          title: data.title.trim(),
          textRu: data.textRu.trim(),
          textUz: data.textUz.trim(),
          status: "DRAFT",
        },
      });

      let submitError: string | null = null;
      if (data.submitToEskiz && isEskizConfigured()) {
        try {
          await submitTemplate(data.textRu.trim());
          await prisma.smsTemplate.update({
            where: { id: template.id },
            data: { status: "MODERATION" },
          });
        } catch (error) {
          // Шаблон остаётся черновиком: подать его можно повторно, терять
          // введённый текст из-за сбоя шлюза незачем.
          submitError = error instanceof EskizError ? error.message : String(error);
        }
      }

      await createAuditLog({
        userId: session.user.id,
        entityType: "SmsTemplate",
        entityId: template.id,
        action: "CREATE",
        metadata: { title: template.title, submitted: Boolean(data.submitToEskiz) },
      });

      revalidateLocalized("/admin/sms");
      return { success: true as const, data: { id: template.id, submitError } };
    },
    { roles: ["ADMIN"] }
  );
}

interface BroadcastRecipient {
  parentId: string;
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  children: string[];
  text: string;
  parts: number;
  unicode: boolean;
  unresolved: string[];
}

interface BroadcastPlan {
  groupName: string;
  templateStatus: string;
  recipients: BroadcastRecipient[];
  sendableCount: number;
  skipped: BroadcastRecipient[];
  withoutPhoneCount: number;
  studentCount: number;
  totalParts: number;
  estimatedCost: number;
}

/**
 * Готовит план рассылки: кому, каким текстом и почём. Обычная функция, а не
 * серверное действие — её вызывают и предпросмотр, и отправка, и через
 * границу действия типы не проходят.
 */
async function buildBroadcastPlan(params: {
  groupId: string;
  templateId: string;
  locale?: "ru" | "uz";
  values?: Record<string, string>;
}): Promise<{ ok: false; error: string } | { ok: true; plan: BroadcastPlan }> {
  const [group, template, parentsResult] = await Promise.all([
    prisma.group.findUnique({
      where: { id: params.groupId },
      select: { id: true, name: true, course: { select: { title: true } } },
    }),
    prisma.smsTemplate.findUnique({ where: { id: params.templateId } }),
    getGroupParents(params.groupId),
  ]);

  if (!group) return { ok: false, error: "groupNotFound" };
  if (!template) return { ok: false, error: "templateNotFound" };
  if (!parentsResult.success) return { ok: false, error: "somethingWentWrong" };

  const raw = params.locale === "uz" ? template.textUz : template.textRu;

  const recipients: BroadcastRecipient[] = parentsResult.data.recipients.map((r) => {
    const text = renderTemplate(raw, {
      parent: r.parent.firstName,
      student: r.children.map((c) => c.firstName).join(", "),
      group: group.name,
      course: group.course.title,
      center: "Best Direction",
      ...params.values,
    });
    const { parts, unicode } = countSmsParts(text);
    return {
      parentId: r.parent.id,
      name: `${r.parent.lastName} ${r.parent.firstName}`,
      phone: r.parent.phone,
      normalizedPhone: normalizePhone(r.parent.phone),
      children: r.children.map((c) => `${c.lastName} ${c.firstName}`),
      text,
      parts,
      unicode,
      unresolved: findUnresolved(text),
    };
  });

  const sendable = recipients.filter((r) => r.normalizedPhone && r.unresolved.length === 0);
  const totalParts = sendable.reduce((sum, r) => sum + r.parts, 0);

  return {
    ok: true,
    plan: {
      groupName: group.name,
      templateStatus: template.status,
      recipients,
      sendableCount: sendable.length,
      skipped: recipients.filter((r) => !r.normalizedPhone || r.unresolved.length > 0),
      withoutPhoneCount: parentsResult.data.withoutPhone.length,
      studentCount: parentsResult.data.studentCount,
      totalParts,
      estimatedCost: totalParts * PART_PRICE,
    },
  };
}

// ---------- previewGroupBroadcast ----------
/**
 * Предпросмотр перед отправкой: получатели, итоговый текст и стоимость.
 * Отдельным действием — чтобы администратор видел сумму до нажатия кнопки,
 * а не узнавал её из списанного баланса.
 */
export async function previewGroupBroadcast(params: {
  groupId: string;
  templateId: string;
  locale?: "ru" | "uz";
  values?: Record<string, string>;
}) {
  return withAuth(
    async () => {
      const result = await buildBroadcastPlan(params);
      if (!result.ok) return { success: false as const, error: result.error };
      return { success: true as const, data: result.plan };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- sendGroupBroadcast ----------
export async function sendGroupBroadcast(params: {
  groupId: string;
  templateId: string;
  locale?: "ru" | "uz";
  values?: Record<string, string>;
}) {
  return withAuth(
    async (session) => {
      if (!isEskizConfigured()) return { success: false as const, error: "smsNotConfigured" };

      const planResult = await buildBroadcastPlan(params);
      if (!planResult.ok) return { success: false as const, error: planResult.error };
      const plan = planResult.plan;

      // Несогласованный шаблон шлюз отобьёт, а попытка уже стоит денег
      if (plan.templateStatus !== "APPROVED") {
        return { success: false as const, error: "templateNotApproved" };
      }

      const sendable = plan.recipients.filter(
        (r) => r.normalizedPhone && r.unresolved.length === 0
      );
      if (sendable.length === 0) return { success: false as const, error: "noRecipients" };

      const dispatchId = randomUUID();

      // Журнал заполняем до отправки: если шлюз ответит ошибкой, останется
      // след, кому пытались отправить и почему не вышло.
      const broadcast = await prisma.smsBroadcast.create({
        data: {
          dispatchId,
          templateId: params.templateId,
          groupId: params.groupId,
          createdById: session.user.id,
          total: sendable.length,
        },
        select: { id: true },
      });

      const messages = sendable.map((r) => ({
        userSmsId: randomUUID(),
        phone: r.normalizedPhone as string,
        text: r.text,
      }));

      await prisma.smsLog.createMany({
        data: messages.map((m, i) => ({
          phone: m.phone,
          text: m.text,
          status: "QUEUED" as const,
          userSmsId: m.userSmsId,
          parts: sendable[i].parts,
          userId: sendable[i].parentId,
          broadcastId: broadcast.id,
        })),
      });

      try {
        await sendBatch({ messages, dispatchId, callbackUrl: callbackUrl() });
        await prisma.smsLog.updateMany({
          where: { broadcastId: broadcast.id },
          data: { status: "SENT" },
        });
      } catch (error) {
        const message = error instanceof EskizError ? error.message : String(error);
        await prisma.smsLog.updateMany({
          where: { broadcastId: broadcast.id },
          data: { status: "FAILED", error: message.slice(0, 500) },
        });
        return { success: false as const, error: message };
      }

      await createAuditLog({
        userId: session.user.id,
        entityType: "SmsBroadcast",
        entityId: broadcast.id,
        action: "CREATE",
        metadata: { groupId: params.groupId, total: sendable.length, dispatchId },
      });

      revalidateLocalized("/admin/sms");
      return {
        success: true as const,
        data: { broadcastId: broadcast.id, sent: sendable.length },
      };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getSmsLog ----------
export async function getSmsLog(params?: { limit?: number }) {
  return withAuth(
    async () => {
      const [messages, broadcasts] = await Promise.all([
        prisma.smsLog.findMany({
          orderBy: { createdAt: "desc" },
          take: params?.limit ?? 50,
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
        prisma.smsBroadcast.findMany({
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

      const delivered = await prisma.smsLog.groupBy({
        by: ["broadcastId", "status"],
        where: { broadcastId: { in: broadcasts.map((b) => b.id) } },
        _count: true,
      });

      return { success: true as const, data: { messages, broadcasts, delivered } };
    },
    { roles: ["ADMIN"] }
  );
}
