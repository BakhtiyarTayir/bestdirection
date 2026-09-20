import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Сессии входа. Живут в базе, а не в подписанном токене: выход, смена пароля
 * и деактивация обрывают доступ сразу, а прежний JWT действовал до 30 дней и
 * не знал ни о смене роли, ни о выключении аккаунта (аудит 2.1).
 *
 * В базе лежит только хэш токена: сама строка есть лишь в куке у владельца.
 */

export const SESSION_COOKIE = "bd_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Отметку «последний раз видели» обновляем не чаще раза в час: иначе каждая
// страница кабинета писала бы в базу
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class SessionsService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Заводит сессию и возвращает токен для куки. */
  async create(userId: string, context: { userAgent?: string; ip?: string } = {}) {
    const token = randomBytes(32).toString("hex");

    await this.prisma.session.create({
      data: {
        tokenHash: this.hash(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent: context.userAgent?.slice(0, 300),
        ip: context.ip?.slice(0, 60),
      },
    });

    return token;
  }

  /** Кто пришёл с этим токеном. Истёкшая сессия считается отсутствующей. */
  async userIdFor(token: string): Promise<string | null> {
    if (!token || token.length < 32) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(token) },
      select: { id: true, userId: true, expiresAt: true, lastSeenAt: true },
    });
    if (!session) return null;

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }

    return session.userId;
  }

  async destroy(token: string) {
    if (!token) return;
    await this.prisma.session
      .deleteMany({ where: { tokenHash: this.hash(token) } })
      .catch(() => undefined);
  }

  /** Все сессии пользователя: смена пароля и деактивация обрывают доступ везде. */
  async destroyAllFor(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  /** Просроченные строки: чистим попутно, отдельного расписания не нужно. */
  async purgeExpired() {
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  setCookie(response: Response, token: string) {
    response.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  clearCookie(response: Response) {
    response.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  private cookieOptions() {
    const secure = (process.env.APP_URL ?? "").startsWith("https://");
    return {
      httpOnly: true,
      secure,
      // lax, а не strict: после перехода по ссылке из письма или из Telegram
      // кука должна уехать вместе с запросом
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_TTL_MS,
    };
  }

  /** Сравнение постоянного времени — для кодов и прочих секретов. */
  static safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
