import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";

// Код живёт 15 минут: его успевают отправить боту, а забытый не висит вечно
const CODE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class TelegramLinkService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Одноразовый код для привязки Telegram. Хранится отдельной строкой, а не в
   * User.telegramChatId: раньше вторая попытка привязки затирала реальный chat
   * id, и вход через Telegram терялся навсегда (аудит 2.8).
   *
   * ttlMs по умолчанию — код из профиля (15 минут, человек тут же открывает
   * бота сам). Приглашение администратора живёт дольше (см.
   * TelegramInviteService): его отправляют по SMS, и открывают не сразу.
   */
  async createCode(userId: string, ttlMs: number = CODE_TTL_MS) {
    const code = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.$transaction([
      // Прошлые коды этого пользователя больше не нужны
      this.prisma.telegramLinkRequest.deleteMany({ where: { userId } }),
      this.prisma.telegramLinkRequest.create({
        data: { code, userId, expiresAt },
      }),
      // Заодно подчищаем чужие протухшие: отдельного планировщика нет
      this.prisma.telegramLinkRequest.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);

    return { code, expiresAt };
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true, telegramUsername: true },
    });
    const isLinked = Boolean(user?.telegramChatId);
    return { isLinked, username: isLinked ? (user?.telegramUsername ?? null) : null };
  }

  async unlink(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { telegramChatId: null, telegramUsername: null },
      }),
      this.prisma.telegramLinkRequest.deleteMany({ where: { userId } }),
    ]);
  }
}
