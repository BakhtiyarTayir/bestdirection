import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { SessionUser } from "./session-user";

const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

/**
 * Пользователь сессии с коротким кэшем. Guard не доверяет роли из токена и
 * каждый раз сверяется с БД, а кэш на 30 секунд избавляет от запроса на каждый
 * вызов. Итог: деактивация и смена роли действуют не позже чем через 30 секунд
 * (в web из-за JWT без сверки — до 30 дней, аудит 2.1).
 *
 * Кэш в памяти процесса: Redis не поднимаем, инстанс api один.
 */
@Injectable()
export class SessionUserCache {
  private readonly entries = new Map<string, { user: SessionUser | null; expiresAt: number }>();

  constructor(private readonly prismaService: PrismaService) {}

  /** null — пользователя нет, он удалён или деактивирован. */
  async get(userId: string): Promise<SessionUser | null> {
    const now = Date.now();
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > now) return cached.user;

    // Обычный клиент не видит удалённых (deletedAt) — для них вернётся null
    const found = await this.prismaService.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, firstName: true, lastName: true, isActive: true },
    });
    const user = found?.isActive
      ? { id: found.id, role: found.role, email: found.email, firstName: found.firstName, lastName: found.lastName }
      : null;

    if (this.entries.size >= MAX_ENTRIES) this.evictExpired(now);
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(userId, { user, expiresAt: now + TTL_MS });
    return user;
  }

  /** Сбросить сразу — после смены роли, деактивации или удаления через api. */
  forget(userId: string) {
    this.entries.delete(userId);
  }

  private evictExpired(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
