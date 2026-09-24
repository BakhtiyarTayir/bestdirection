import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SmsService } from "../notifications/sms.service";
import { TelegramLinkService } from "./telegram-link.service";

/**
 * Приглашение в Telegram, которое выдаёт администратор (план
 * PLAN-TELEGRAM-INVITE-2026-09-24): родителя заводят с логином и случайным
 * паролем, который никто не знает, а привязать Telegram раньше можно было
 * только из своего же профиля, уже войдя — замкнутый круг. Здесь код
 * приглашения выдаёт администратор, ссылку можно скопировать, показать
 * QR-кодом или отправить по SMS.
 */

// Живёт неделю: ссылку могут прочитать не сразу (особенно если она ушла по
// SMS), а код из профиля (15 минут, TelegramLinkService.CODE_TTL_MS)
// рассчитан на то, что человек тут же открывает бота сам.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TelegramInviteService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly telegramLink: TelegramLinkService,
    private readonly sms: SmsService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Отдаём с сервера тем же способом, что и кнопка входа (auth.controller.ts) — в сборку web оно не попадает. */
  private botUsername(): string | null {
    return process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null;
  }

  private async fetchUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, phone: true, telegramChatId: true },
    });
    if (!user) throw new NotFoundException("userNotFound");
    return user;
  }

  /** Минтит код и собирает ссылку на бота. Chat id наружу нигде не уходит — только признак isLinked у вызывающего. */
  private async issueLink(userId: string) {
    const bot = this.botUsername();
    if (!bot) throw new ConflictException("botNotConfigured");

    const { code, expiresAt } = await this.telegramLink.createCode(userId, INVITE_TTL_MS);
    return { url: `https://t.me/${bot}?start=${code}`, expiresAt };
  }

  /**
   * Ссылка-приглашение: копировать/показать QR. Если Telegram уже привязан —
   * всё равно выдаём (переприкрепить к новому телефону при потере доступа),
   * но сообщаем isLinked: true — интерфейс это покажет.
   */
  async createInvite(userId: string, actor: SessionUser) {
    const user = await this.fetchUser(userId);
    const { url, expiresAt } = await this.issueLink(userId);
    const isLinked = Boolean(user.telegramChatId);

    await this.audit.record({
      userId: actor.id,
      entityType: "TelegramInvite",
      entityId: userId,
      action: "CREATE",
      metadata: { method: "link", isLinked },
    });

    return { url, expiresAt, isLinked };
  }

  /**
   * Та же ссылка + отправка по SMS. Отсутствие номера — ошибка ввода (400), а
   * не молчаливое sent:false, как при сбое шлюза: администратору нужно
   * сначала завести телефон в карточке. Проверяем это ДО минта кода — иначе
   * неудачная попытка отправки уже погасила бы прежнее приглашение.
   */
  async sendInviteSms(userId: string, actor: SessionUser) {
    const user = await this.fetchUser(userId);
    if (!user.phone) throw new BadRequestException("noPhone");

    const { url, expiresAt } = await this.issueLink(userId);
    const isLinked = Boolean(user.telegramChatId);

    const text = `Best Direction: ${user.firstName}, bildirishnomalar va kirish uchun Telegram'ni ulang: ${url}`;
    const result = await this.sms.sendOne({ phone: user.phone, text, userId });

    await this.audit.record({
      userId: actor.id,
      entityType: "TelegramInvite",
      entityId: userId,
      action: "CREATE",
      metadata: { method: "sms", isLinked, sent: result.sent, reason: result.reason },
    });

    return { url, expiresAt, isLinked, sent: result.sent, reason: result.reason };
  }
}
