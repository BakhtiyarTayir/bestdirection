import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  hashVerificationCode,
} from "../../common/email/codes";
import { EmailService } from "../../common/email/email.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SessionUserCache } from "../../common/auth/session-user.cache";
import { SessionsService } from "../../common/auth/sessions.service";
import type {
  LoginDto,
  RegisterDto,
  RequestEmailDto,
  ResetPasswordDto,
  TelegramWidgetDto,
  VerifyCodeDto,
} from "./dto/auth.dto";

/**
 * Вход, регистрация и восстановление пароля. Перенесено из src/lib/auth.ts,
 * src/actions/auth-actions.ts, email-verification-actions.ts,
 * telegram-auth-actions.ts и src/lib/telegram/login.ts в web.
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
    private readonly email: EmailService,
    private readonly cache: SessionUserCache
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Без фильтра мягкого удаления: удалённый аккаунт тоже занимает адрес. */
  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  // ─── Вход ───────────────────────────────────────────────────────────────

  async loginWithPassword(data: LoginDto, context: { userAgent?: string; ip?: string }) {
    const email = data.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? DUMMY_HASH);

    // Один ответ на «нет такого адреса», «не тот пароль» и «аккаунт выключен»:
    // иначе по нему перебирают, кто зарегистрирован (аудит 2.12)
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

    const user = await this.findOrCreateTelegramUser({
      telegramId: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      username: data.username,
    });
    if (!user) throw new ForbiddenException("accountDisabled");

    return this.startSession(user.id, context);
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

    const user = await this.findOrCreateTelegramUser({
      telegramId: request.telegramChatId,
      firstName: request.firstName,
      lastName: request.lastName,
      username: request.telegramUsername,
    });
    if (!user) throw new ForbiddenException("accountDisabled");

    return this.startSession(user.id, context);
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

  // ─── Регистрация ────────────────────────────────────────────────────────

  /**
   * Код на почту. Ответ одинаковый и для свободного, и для занятого адреса:
   * иначе форма превращается в проверку «кто зарегистрирован» (аудит 2.12).
   * Занятому адресу код просто не отправляется.
   */
  async requestEmailVerification(data: RequestEmailDto) {
    const email = data.email.trim().toLowerCase();
    if (!this.email.isConfigured()) throw new BadRequestException("emailNotConfigured");

    const existing = await this.prismaUnscoped.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) return { ok: true as const };

    return this.issueCode(email, data.locale, "register");
  }

  async verifyEmailCode(data: VerifyCodeDto) {
    const email = data.email.trim().toLowerCase();
    await this.checkCode(email, data.code, { consume: false });
    return { ok: true as const };
  }

  async register(data: RegisterDto) {
    const email = data.email.trim().toLowerCase();

    const existing = await this.prismaUnscoped.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) throw new BadRequestException("emailAlreadyExists");

    await this.checkCode(email, data.code, { consume: true });

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        role: "STUDENT",
      },
      select: { id: true },
    });

    return { id: user.id };
  }

  // ─── Восстановление пароля ──────────────────────────────────────────────

  /** Тот же ответ и для существующего, и для неизвестного адреса (2.12). */
  async requestPasswordReset(data: RequestEmailDto) {
    const email = data.email.trim().toLowerCase();
    if (!this.email.isConfigured()) throw new BadRequestException("emailNotConfigured");

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) return { ok: true as const };

    return this.issueCode(email, data.locale, "reset");
  }

  async resetPassword(data: ResetPasswordDto) {
    const email = data.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    // Код привязан к адресу, поэтому неизвестный адрес отвечает как неверный код
    if (!user || !user.isActive) throw new BadRequestException("invalidCode");

    await this.checkCode(email, data.code, { consume: true });

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Смена пароля обрывает все сессии: если доступ был у чужого, он потерян
    await this.sessions.destroyAllFor(user.id);
    this.cache.forget(user.id);

    return { ok: true as const };
  }

  // ─── Общее ──────────────────────────────────────────────────────────────

  private async startSession(userId: string, context: { userAgent?: string; ip?: string }) {
    const token = await this.sessions.create(userId, context);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, role: true, email: true, firstName: true, lastName: true },
    });
    return { token, user };
  }

  /** Заводит код, соблюдая паузу между отправками. */
  private async issueCode(email: string, locale: string | undefined, kind: "register" | "reset") {
    const existing = await this.prisma.emailVerificationCode.findUnique({ where: { email } });
    if (existing && Date.now() - existing.sentAt.getTime() < EMAIL_CODE_RESEND_COOLDOWN_MS) {
      throw new BadRequestException("resendCooldown");
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = hashVerificationCode(email, code);
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);

    await this.prisma.emailVerificationCode.upsert({
      where: { email },
      create: { email, codeHash, expiresAt },
      update: { codeHash, attempts: 0, expiresAt, sentAt: new Date() },
    });

    const sent = await this.email.sendVerificationCode(email, code, locale ?? "ru", kind);
    if (!sent) throw new BadRequestException("emailSendFailed");

    return { ok: true as const };
  }

  /**
   * Проверка кода. `consume` гасит его: при регистрации и сбросе пароля код
   * одноразовый, а на промежуточном шаге проверки он ещё нужен.
   */
  private async checkCode(email: string, code: string, { consume }: { consume: boolean }) {
    const verification = await this.prisma.emailVerificationCode.findUnique({ where: { email } });
    if (!verification || verification.expiresAt < new Date()) {
      throw new BadRequestException("codeExpired");
    }
    if (verification.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException("tooManyAttempts");
    }

    const expected = hashVerificationCode(email, code);
    if (!SessionsService.safeEqual(verification.codeHash, expected)) {
      await this.prisma.emailVerificationCode.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("invalidCode");
    }

    if (consume) {
      await this.prisma.emailVerificationCode.delete({ where: { id: verification.id } });
    }
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
   * Пользователь по Telegram ID или новый ученик. Ищем без фильтра мягкого
   * удаления: chatId остаётся занятым в уникальном индексе и у удалённого
   * аккаунта, и обычный поиск его не видел — следующий create падал с P2002
   * вместо отказа во входе.
   */
  private async findOrCreateTelegramUser(profile: {
    telegramId: string;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
  }) {
    const existing = await this.prismaUnscoped.user.findUnique({
      where: { telegramChatId: profile.telegramId },
    });

    if (existing) {
      if (!existing.isActive || existing.deletedAt) return null;
      return existing;
    }

    return this.prisma.user.create({
      data: {
        firstName: profile.firstName?.trim() || profile.username || "Telegram",
        lastName: profile.lastName?.trim() || "",
        role: "STUDENT",
        telegramChatId: profile.telegramId,
        telegramUsername: profile.username || null,
      },
    });
  }
}
