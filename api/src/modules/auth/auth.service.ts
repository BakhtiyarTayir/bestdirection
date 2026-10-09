import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  hashResetCode,
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_RESEND_COOLDOWN_MS,
  RESET_CODE_TTL_MS,
} from "../../common/auth/password-reset";
import { PrismaService } from "../../common/prisma/prisma.service";
import { sealPassword } from "../../common/security/password-vault";
import { SessionUserCache } from "../../common/auth/session-user.cache";
import { SessionsService } from "../../common/auth/sessions.service";
import { TelegramNotifyService } from "../../common/telegram/telegram-notify.service";
import type {
  LoginDto,
  RequestTelegramPasswordResetDto,
  ResetPasswordViaTelegramDto,
  TelegramWidgetDto,
} from "./dto/auth.dto";

/**
 * Вход и восстановление пароля. Перенесено из src/lib/auth.ts,
 * src/actions/auth-actions.ts, telegram-auth-actions.ts и
 * src/lib/telegram/login.ts в web. Почта убрана целиком (шаг 2 отказа от
 * почты, PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1, чек-лист 4.8):
 * логин — единственный опознавательный знак, Telegram — единственный
 * самостоятельный путь восстановления.
 */

const TELEGRAM_AUTH_MAX_AGE_SECONDS = 10 * 60;
const TELEGRAM_LOGIN_TTL_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

// Хэш несуществующего пароля: сравниваем с ним, когда пользователя нет, чтобы
// ответ занимал столько же времени и по задержке нельзя было узнать, заведён
// ли адрес (аудит 2.12).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessions: SessionsService,
    private readonly cache: SessionUserCache,
    private readonly telegramNotify: TelegramNotifyService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Без фильтра мягкого удаления: удалённый аккаунт тоже занимает адрес. */
  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  // ─── Вход ───────────────────────────────────────────────────────────────

  /** Вход по логину — единственному опознавательному знаку после ухода почты. */
  async loginWithPassword(data: LoginDto, context: { userAgent?: string; ip?: string }) {
    const login = data.login.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { login } });

    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? DUMMY_HASH);

    // Один ответ на «нет такого логина/адреса», «не тот пароль» и «аккаунт
    // выключен»: иначе по нему перебирают, кто зарегистрирован (аудит 2.12)
    if (!user || !user.passwordHash || !valid || !user.isActive) {
      throw new UnauthorizedException("invalidCredentials");
    }

    return this.startSession(user.id, context);
  }

  /**
   * Вход через виджет Telegram: полезную нагрузку подписывает бот, подпись
   * проверяем сами.
   */
  async loginWithTelegramWidget(data: TelegramWidgetDto, context: { userAgent?: string; ip?: string }) {
    if (!this.verifyWidgetSignature(data)) throw new UnauthorizedException("invalidSignature");

    return this.startSession((await this.requireTelegramUser(data.id)).id, context);
  }

  /** Вход по коду из чата с ботом: код одноразовый. */
  async loginWithTelegramCode(code: string, context: { userAgent?: string; ip?: string }) {
    // Удаляем заявку атомарно — второй раз тем же кодом войти нельзя
    const request = await this.prisma.telegramAuthRequest
      .delete({ where: { code } })
      .catch(() => null);

    if (
      !request ||
      request.status !== "CONFIRMED" ||
      !request.telegramChatId ||
      request.expiresAt < new Date()
    ) {
      throw new UnauthorizedException("loginCodeInvalid");
    }

    return this.startSession((await this.requireTelegramUser(request.telegramChatId)).id, context);
  }

  /** Заявка на вход через бота: код показывается на странице входа. */
  async createTelegramLoginRequest() {
    // Попутная уборка истёкших заявок
    await this.prisma.telegramAuthRequest.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const code = randomBytes(16).toString("hex");
    await this.prisma.telegramAuthRequest.create({
      data: { code, expiresAt: new Date(Date.now() + TELEGRAM_LOGIN_TTL_MS) },
    });

    return { code };
  }

  async telegramLoginStatus(code: string) {
    if (!/^[0-9a-f]{32}$/.test(code)) return { status: "EXPIRED" as const };

    const request = await this.prisma.telegramAuthRequest.findUnique({
      where: { code },
      select: { status: true, expiresAt: true },
    });
    if (!request || request.expiresAt < new Date()) return { status: "EXPIRED" as const };

    return { status: request.status as "PENDING" | "CONFIRMED" };
  }

  async logout(token: string | undefined) {
    if (token) await this.sessions.destroy(token);
    return { ok: true as const };
  }

  // ─── Восстановление пароля через Telegram ───────────────────────────────
  //
  // Самостоятельная регистрация и почтовый сброс пароля убраны целиком (шаг 2
  // отказа от почты): учеников заводит администратор, а Telegram — теперь
  // единственный самостоятельный путь восстановления доступа.

  /**
   * Тот же ответ и для неизвестного логина, и для того, у кого не привязан
   * Telegram (аудит 2.12 — форма не должна превращаться в перебор логинов).
   */
  async requestTelegramPasswordReset(data: RequestTelegramPasswordResetDto) {
    const login = data.login.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { login },
      select: { id: true, isActive: true, telegramChatId: true },
    });
    if (!user || !user.isActive || !user.telegramChatId) return { ok: true as const };

    const existing = await this.prisma.passwordResetRequest.findUnique({ where: { userId: user.id } });
    if (existing && Date.now() - existing.sentAt.getTime() < RESET_CODE_RESEND_COOLDOWN_MS) {
      return { ok: true as const };
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = hashResetCode(user.id, code);
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);

    await this.prisma.passwordResetRequest.upsert({
      where: { userId: user.id },
      create: { userId: user.id, codeHash, expiresAt },
      update: { codeHash, attempts: 0, expiresAt, sentAt: new Date() },
    });

    await this.telegramNotify.send(user.telegramChatId, `Код для смены пароля: ${code}`);
    return { ok: true as const };
  }

  async resetPasswordViaTelegram(data: ResetPasswordViaTelegramDto) {
    const login = data.login.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { login },
      select: { id: true, isActive: true, role: true },
    });
    // Код привязан к userId, поэтому неизвестный логин отвечает как неверный код
    if (!user || !user.isActive) throw new BadRequestException("invalidCode");

    const request = await this.prisma.passwordResetRequest.findUnique({ where: { userId: user.id } });
    if (!request || request.expiresAt < new Date()) throw new BadRequestException("codeExpired");
    if (request.attempts >= RESET_CODE_MAX_ATTEMPTS) throw new BadRequestException("tooManyAttempts");

    const expected = hashResetCode(user.id, data.code);
    if (!SessionsService.safeEqual(request.codeHash, expected)) {
      await this.prisma.passwordResetRequest.update({
        where: { id: request.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("invalidCode");
    }

    await this.prisma.passwordResetRequest.delete({ where: { id: request.id } });

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    // Пароль ученика запоминаем обратимо для администратора (решение владельца,
    // PLAN-STUDENT-PASSWORDS-2026-10-09.md); у остальных ролей passwordEnc всегда null
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordEnc: user.role === "STUDENT" ? sealPassword(data.newPassword) : null },
    });

    // Смена пароля обрывает все сессии: если доступ был у чужого, он потерян
    await this.sessions.destroyAllFor(user.id);
    this.cache.forget(user.id);

    return { ok: true as const };
  }

  // ─── Общее ──────────────────────────────────────────────────────────────

  private async startSession(userId: string, context: { userAgent?: string; ip?: string }) {
    const token = await this.sessions.create(userId, context);
    // Для «ни разу не входил» в выдаче паролей ученикам
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, role: true, login: true, firstName: true, lastName: true },
    });
    return { token, user };
  }

  /**
   * Подпись виджета Telegram.
   * https://core.telegram.org/widgets/login#checking-authorization
   */
  private verifyWidgetSignature(payload: TelegramWidgetDto): boolean {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return false;

    const { hash, ...fields } = payload;
    const authDate = Number(fields.auth_date);
    if (!Number.isFinite(authDate)) return false;
    if (Math.abs(Date.now() / 1000 - authDate) > TELEGRAM_AUTH_MAX_AGE_SECONDS) return false;

    const dataCheckString = Object.keys(fields)
      .filter((key) => {
        const value = (fields as Record<string, unknown>)[key];
        return value !== undefined && value !== "";
      })
      .sort()
      .map((key) => `${key}=${(fields as Record<string, unknown>)[key]}`)
      .join("\n");

    const secretKey = createHash("sha256").update(botToken).digest();
    const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();

    let received: Buffer;
    try {
      received = Buffer.from(hash, "hex");
    } catch {
      return false;
    }
    return received.length === expected.length && timingSafeEqual(expected, received);
  }

  /**
   * Пользователь по Telegram ID. Учётную запись больше НЕ заводит — только
   * ищет (PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1): пока была открыта
   * страница регистрации, автосоздание было лишь одной из дверей, а после её
   * закрытия осталось бы единственной незащищённой — учеников заводит
   * администратор. Ищем без фильтра мягкого удаления: chatId остаётся
   * занятым в уникальном индексе и у удалённого аккаунта.
   */
  private async requireTelegramUser(telegramId: string) {
    const user = await this.prismaUnscoped.user.findUnique({ where: { telegramChatId: telegramId } });
    // Незнакомец — понятный отказ, а не тихое создание записи
    if (!user) throw new UnauthorizedException("telegramUnknown");
    if (!user.isActive || user.deletedAt) throw new ForbiddenException("accountDisabled");
    return user;
  }
}
