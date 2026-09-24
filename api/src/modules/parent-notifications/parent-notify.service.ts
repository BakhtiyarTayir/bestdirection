import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { botMessages } from "../../common/telegram/messages";
import { TelegramNotifyService } from "../../common/telegram/telegram-notify.service";

/**
 * Точечные уведомления родителям об успеваемости ребёнка: пропуск занятия
 * (2.1) и проверенное домашнее задание (2.2). Еженедельная сводка (2.3) —
 * отдельно, в weekly-digest.service.ts (у неё свой вход — cron, а не событие
 * действия персонала).
 *
 * Best-effort по всей цепочке: ни один метод здесь не бросает исключений —
 * вызывающий сервис (attendance/submissions) зовёт их после записи в БД и не
 * ждёт результата (fire-and-forget), поэтому упавшая отправка не должна
 * всплыть необработанным rejection и тем более не должна ломать основное
 * действие (отметку в журнале, проверку задания).
 */
@Injectable()
export class ParentNotifyService {
  private readonly logger = new Logger(ParentNotifyService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly telegram: TelegramNotifyService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Родители ученика, которым можно писать: Telegram привязан и уведомления не отключены. */
  private async notifiableParents(studentId: string): Promise<string[]> {
    const links = await this.prisma.parentStudent.findMany({
      where: {
        studentId,
        parent: { telegramChatId: { not: null }, parentProgressNotifications: true },
      },
      select: { parent: { select: { telegramChatId: true } } },
    });
    // telegramChatId здесь точно не null — отфильтровано в where, но Prisma
    // об этом не знает, отбрасываем null явно, а не приводим типы
    return links.map((link) => link.parent.telegramChatId).filter((id): id is string => id !== null);
  }

  async notifyAbsence(input: { studentId: string; studentName: string; groupOrCourseName: string; dateDdMm: string }) {
    try {
      const chatIds = await this.notifiableParents(input.studentId);
      if (chatIds.length === 0) return;
      const text = botMessages.studentAbsent(input.studentName, input.groupOrCourseName, input.dateDdMm);
      await Promise.all(chatIds.map((chatId) => this.telegram.send(chatId, text)));
    } catch (error) {
      this.logger.warn(`Не удалось отправить уведомление о пропуске: ${String(error)}`);
    }
  }

  async notifyHomeworkReviewed(input: {
    studentId: string;
    studentName: string;
    homeworkTitle: string;
    status: "APPROVED" | "REJECTED" | "REVISION";
    score: string | null;
  }) {
    try {
      const chatIds = await this.notifiableParents(input.studentId);
      if (chatIds.length === 0) return;
      const text = botMessages.homeworkReviewed(
        input.studentName,
        input.homeworkTitle,
        input.status,
        input.score
      );
      await Promise.all(chatIds.map((chatId) => this.telegram.send(chatId, text)));
    } catch (error) {
      this.logger.warn(`Не удалось отправить уведомление о проверке задания: ${String(error)}`);
    }
  }
}
