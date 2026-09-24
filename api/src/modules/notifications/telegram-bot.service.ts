import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Bot, InlineKeyboard, type Context } from "grammy";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { botMessages, SUBMIT_ERROR_MESSAGES } from "../../common/telegram/messages";
import { activeEnrollmentFilter } from "../billing/billing-ledger.service";
import { uploadDir } from "../homework/uploads.service";
import { WeeklyDigestService } from "../parent-notifications/weekly-digest.service";
import { SubmissionsService } from "../homework/submissions.service";

/**
 * Бот Telegram. Перенесено из src/lib/telegram/bot.ts в web.
 *
 * Что изменилось при переносе:
 * - работы, присланные боту, заводит общий SubmissionsService — тот же, что и
 *   у кабинета. Своей копии проверок лимита и срока у бота больше нет;
 * - файл ложится в приватный том работ, а не в публичный `public/uploads`,
 *   как было раньше;
 * - ветка «код на проверку» убрана: автопроверки нет (Piston отключён
 *   решением владельца), а присланный .py принимается как обычный файл.
 */

const PENDING_FILE_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface TelegramDocumentMeta {
  fileId: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}

interface PendingTelegramFile extends TelegramDocumentMeta {
  chatId: string;
  createdAt: number;
}


@Injectable()
export class TelegramBotService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot | null = null;

  /** Файлы, ждущие выбора задания: живут в памяти процесса, TTL 10 минут. */
  private readonly pendingFiles = new Map<string, PendingTelegramFile>();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly submissions: SubmissionsService,
    private readonly audit: AuditService,
    private readonly weeklyDigest: WeeklyDigestService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  private get token() {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  isConfigured() {
    return Boolean(this.token);
  }

  /** Бот создаётся при первом обновлении: без токена он не нужен вовсе. */
  getBot(): Bot {
    if (!this.token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
    if (!this.bot) {
      this.bot = this.createBot(this.token);
    }
    return this.bot;
  }

  async onModuleDestroy() {
    this.pendingFiles.clear();
  }

  private createBot(token: string): Bot {
    const bot = new Bot(token);

    // Не даём одной упавшей команде обрушить webhook в 500: иначе Telegram
    // бесконечно повторяет обновление и очередь бота встаёт.
    bot.catch((err) => this.logger.error(`Ошибка бота: ${String(err.error)}`));

    // Telegram позволяет сменить @имя в любой момент, а в базе оно записано
    // в момент привязки и само не обновляется — ссылка «Написать в Telegram»
    // на карточках людей (4.2) вела бы в никуда. Обновляем при КАЖДОМ
    // взаимодействии с ботом, а не только при входе/привязке.
    bot.use(async (ctx, next) => {
      const chatId = ctx.chat ? String(ctx.chat.id) : null;
      const username = ctx.from?.username ?? null;
      if (chatId && username) {
        await this.prisma.user
          .updateMany({
            where: { telegramChatId: chatId, telegramUsername: { not: username } },
            data: { telegramUsername: username },
          })
          .catch(() => undefined);
      }
      await next();
    });

    bot.command("start", async (ctx) => {
      const code = ctx.match;
      if (code && code.startsWith("login_")) {
        await this.handleLoginRequest(ctx, code.slice("login_".length));
        return;
      }
      if (code) {
        await this.handleLinkAccount(ctx, code);
        return;
      }

      const user = await this.findUserByChatId(String(ctx.chat.id));
      let wasStopped = false;
      if (user) {
        // /start без кода — не только приветствие уже привязанному: это же
        // команда включения обратно после /stop (план PLAN-PARENT-PROGRESS-2026-09-24,
        // 2.4).
        wasStopped = !user.parentProgressNotifications;
        if (wasStopped) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { parentProgressNotifications: true },
          });
        }
      }
      const greeting = !user
        ? botMessages.notLinkedGreeting
        : user.role === "PARENT"
          ? botMessages.parentGreeting(user.firstName, user.lastName)
          : botMessages.linkedGreeting(user.firstName, user.lastName);
      await ctx.reply(wasStopped ? `${greeting}\n\n${botMessages.notificationsResumed}` : greeting);
    });

    bot.command("stop", async (ctx) => {
      const user = await this.findUserByChatId(String(ctx.chat.id));
      if (!user) {
        await ctx.reply(botMessages.linkAccountFirst);
        return;
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { parentProgressNotifications: false },
      });
      await ctx.reply(botMessages.notificationsStopped);
    });

    // Родителю — сводка по детям за текущую неделю (тот же расчёт, что у
    // понедельничной рассылки). Остальным ролям команда не нужна
    bot.command("progress", async (ctx) => {
      const user = await this.findUserByChatId(String(ctx.chat.id));
      if (!user) {
        await ctx.reply(botMessages.linkAccountFirst);
        return;
      }
      if (user.role !== "PARENT") {
        await ctx.reply(botMessages.progressParentsOnly);
        return;
      }
      const summaries = await this.weeklyDigest.summariesForParent(user.id);
      if (summaries.length === 0) {
        await ctx.reply(botMessages.noChildrenLinked);
        return;
      }
      for (const summary of summaries) await ctx.reply(summary);
    });

    bot.command("homework", async (ctx) => {
      const user = await this.findUserByChatId(String(ctx.chat.id));
      if (!user) {
        await ctx.reply(botMessages.linkAccountFirst);
        return;
      }
      // Задания и загрузка кода — для учеников; родителю — про ребёнка
      if (user.role === "PARENT") {
        await ctx.reply(botMessages.parentHomeworkHint);
        return;
      }

      const homeworks = await this.studentHomeworks(user.id);
      if (homeworks.length === 0) {
        await ctx.reply(botMessages.noActiveHomework);
        return;
      }

      let message = botMessages.activeHomeworkHeader;
      for (const homework of homeworks) {
        const due = homework.dueDate ? homework.dueDate.toISOString().slice(0, 10) : "—";
        message += `${homework.title}\n`;
        message += `${botMessages.homeworkCourse(homework.courseTitle)}\n`;
        message += `${botMessages.homeworkAttempts(`${homework.used}/${homework.maxAttempts}`, due)}\n\n`;
      }
      message += botMessages.sendCodeFile;

      await ctx.reply(message);
    });

    bot.command("unlink", async (ctx) => {
      const user = await this.findUserByChatId(String(ctx.chat.id));
      if (!user) {
        await ctx.reply(botMessages.accountNotLinked);
        return;
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: null, telegramUsername: null },
      });
      await ctx.reply(botMessages.accountUnlinked);
    });

    bot.on("message:document", async (ctx) => {
      const user = await this.findUserByChatId(String(ctx.chat.id));
      if (!user) {
        await ctx.reply(botMessages.linkAccountFirst);
        return;
      }
      if (user.role === "PARENT") {
        await ctx.reply(botMessages.parentHomeworkHint);
        return;
      }

      const document = this.documentOf(ctx);
      if (!document) {
        await ctx.reply(botMessages.fileFetchFailed);
        return;
      }

      if (document.fileSize && document.fileSize > MAX_FILE_SIZE) {
        await ctx.reply(botMessages.fileTooLargeUpload);
        return;
      }

      const homeworks = await this.studentHomeworks(user.id);
      if (homeworks.length === 0) {
        await ctx.reply(botMessages.noFileHomework);
        return;
      }

      if (homeworks.length === 1) {
        await this.submitFile(ctx, user.id, homeworks[0].id, document);
        return;
      }

      const token = this.rememberFile({
        chatId: String(ctx.chat.id),
        createdAt: Date.now(),
        ...document,
      });

      const keyboard = new InlineKeyboard();
      for (const homework of homeworks) {
        keyboard.text(`${homework.title} (${homework.courseTitle})`, `fileupload:${homework.id}:${token}`).row();
      }
      await ctx.reply(botMessages.chooseHomeworkToUpload, { reply_markup: keyboard });
    });

    bot.on("callback_query:data", async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (!ctx.chat) return;

      if (data.startsWith("tglogin:")) {
        await this.handleLoginConfirm(ctx, data.slice("tglogin:".length));
        return;
      }

      // submit: — старые кнопки автопроверки, они больше не приходят
      if (!data.startsWith("fileupload:")) return;

      const [, homeworkId, token] = data.split(":");
      if (!homeworkId || !token) {
        await ctx.answerCallbackQuery({ text: botMessages.resendFile });
        return;
      }

      const user = await this.findUserByChatId(String(ctx.chat.id));
      if (!user) {
        await ctx.answerCallbackQuery({ text: botMessages.accountNotLinked });
        return;
      }

      await ctx.answerCallbackQuery();

      const pending = this.takeFile(token, String(ctx.chat.id));
      if (!pending) {
        await ctx.reply(botMessages.selectionExpired);
        return;
      }

      await this.submitFile(ctx, user.id, homeworkId, pending);
    });

    return bot;
  }

  // ─── Вход и привязка ──────────────────────────────────────────────────

  private async findValidLoginRequest(code: string) {
    if (!/^[0-9a-f]{32}$/.test(code)) return null;
    const request = await this.prisma.telegramAuthRequest.findUnique({ where: { code } });
    if (!request || request.expiresAt < new Date()) return null;
    return request;
  }

  private async handleLoginRequest(ctx: Context, code: string) {
    if (!ctx.chat) return;

    const request = await this.findValidLoginRequest(code);
    if (!request) {
      await ctx.reply(botMessages.loginCodeNotFound);
      return;
    }

    const keyboard = new InlineKeyboard().text(botMessages.confirmLoginButton, `tglogin:${code}`);
    await ctx.reply(botMessages.loginPrompt, { reply_markup: keyboard });
  }

  private async handleLoginConfirm(ctx: Context, code: string) {
    if (!ctx.chat || !ctx.from) return;

    const request = await this.findValidLoginRequest(code);
    if (!request || request.status !== "PENDING") {
      await ctx.answerCallbackQuery({ text: botMessages.loginCodeExpired });
      return;
    }

    await this.prisma.telegramAuthRequest.update({
      where: { id: request.id },
      data: {
        status: "CONFIRMED",
        telegramChatId: String(ctx.chat.id),
        telegramUsername: ctx.from.username || null,
        firstName: ctx.from.first_name || null,
        lastName: ctx.from.last_name || null,
      },
    });

    await ctx.answerCallbackQuery({ text: botMessages.loginConfirmedShort });
    await ctx.reply(botMessages.loginConfirmed);
  }

  private async handleLinkAccount(ctx: Context, linkCode: string) {
    if (!ctx.chat) return;

    // Код живёт в отдельной таблице. Раньше он лежал в User.telegramChatId
    // как "pending:<код>" и затирал настоящий chat id — вторая попытка
    // привязки ломала вход (аудит 2.8).
    const request = await this.prisma.telegramLinkRequest.findUnique({
      where: { code: linkCode },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });

    if (!request || request.expiresAt < new Date()) {
      if (request) {
        await this.prisma.telegramLinkRequest
          .delete({ where: { id: request.id } })
          .catch(() => undefined);
      }
      await ctx.reply(botMessages.linkCodeNotFound);
      return;
    }

    const pendingUser = request.user;

    // Этот Telegram может быть уже занят другим аккаунтом (например,
    // созданным при входе через Telegram)
    const holder = await this.prisma.user.findUnique({
      where: { telegramChatId: String(ctx.chat.id) },
    });
    if (holder && holder.id !== pendingUser.id) {
      await this.prisma.telegramLinkRequest
        .delete({ where: { id: request.id } })
        .catch(() => undefined);
      await ctx.reply(botMessages.telegramAlreadyTaken(holder.firstName, holder.lastName));
      return;
    }

    // Код одноразовый: привязка и удаление кода — одной транзакцией
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: pendingUser.id },
        data: {
          telegramChatId: String(ctx.chat.id),
          telegramUsername: ctx.from?.username || null,
        },
      }),
      this.prisma.telegramLinkRequest.deleteMany({ where: { userId: pendingUser.id } }),
    ]);

    if (pendingUser.role === "PARENT") {
      // Родитель привязал СВОЙ Telegram — дальше ему пишут о детях, поэтому
      // сразу называем, о ком будут приходить сообщения
      const children = await this.prisma.parentStudent.findMany({
        where: { parentId: pendingUser.id },
        select: { student: { select: { firstName: true, lastName: true } } },
      });
      await ctx.reply(
        botMessages.parentLinked(
          pendingUser.firstName,
          pendingUser.lastName,
          children.map((link) => `${link.student.firstName} ${link.student.lastName}`.trim())
        )
      );
      return;
    }
    await ctx.reply(botMessages.accountLinked(pendingUser.firstName, pendingUser.lastName));
  }

  // ─── Сдача работ ──────────────────────────────────────────────────────

  /**
   * Опубликованные задания курсов, на которые записан ученик. Отчисленный
   * (billingEndsAt без группы) курс из списка выпадает — доступ на сдачу всё
   * равно закрыт в SubmissionsService, но показывать его в списке незачем.
   */
  private async studentHomeworks(studentId: string) {
    const homeworks = await this.prisma.homework.findMany({
      where: {
        isPublished: true,
        lesson: {
          isPublished: true,
          course: { enrollments: { some: { studentId, ...activeEnrollmentFilter() } } },
        },
      },
      select: {
        id: true,
        title: true,
        maxAttempts: true,
        dueDate: true,
        lesson: { select: { course: { select: { title: true } } } },
        _count: { select: { submissions: { where: { studentId } } } },
      },
      orderBy: { dueDate: "asc" },
    });

    return homeworks.map((homework) => ({
      id: homework.id,
      title: homework.title,
      courseTitle: homework.lesson.course.title,
      maxAttempts: homework.maxAttempts,
      dueDate: homework.dueDate,
      used: homework._count.submissions,
    }));
  }

  /**
   * Скачивает файл у Telegram, кладёт в приватный том и заводит работу общим
   * сервисом сдач — те же проверки записи, срока и лимита попыток.
   */
  private async submitFile(
    ctx: Context,
    studentId: string,
    homeworkId: string,
    document: TelegramDocumentMeta
  ) {
    await ctx.reply(botMessages.uploadingFile(document.fileName));

    let filePath: string | undefined;
    try {
      const file = await this.getBot().api.getFile(document.fileId);
      const response = await fetch(
        `https://api.telegram.org/file/bot${this.token}/${file.file_path}`
      );
      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length === 0) {
        await this.logEvent({ studentId, homeworkId, status: "rejected", reason: "empty_file", fileName: document.fileName });
        await ctx.reply(botMessages.emptyFile);
        return;
      }
      if (buffer.length > MAX_FILE_SIZE) {
        await this.logEvent({ studentId, homeworkId, status: "rejected", reason: "file_too_large", fileName: document.fileName });
        await ctx.reply(botMessages.fileTooLargeUpload);
        return;
      }

      const directory = uploadDir("homework");
      await mkdir(directory, { recursive: true });
      filePath = join(
        directory,
        `${Date.now()}-${randomBytes(4).toString("hex")}${extname(document.fileName).toLowerCase()}`
      );
      await writeFile(filePath, buffer);

      const submission = await this.submissions.submitFile(
        homeworkId,
        { originalname: document.fileName, path: filePath, size: buffer.length },
        { id: studentId, role: "STUDENT" } as never
      );

      const homework = await this.prisma.homework.findUnique({
        where: { id: homeworkId },
        select: { title: true, maxAttempts: true, latePenalty: true },
      });

      await this.logEvent({
        studentId,
        homeworkId,
        status: "accepted",
        fileName: document.fileName,
        details: { submissionId: submission.id },
      });

      await ctx.reply(botMessages.submissionAccepted);
      let message = botMessages.fileSubmitted(
        homework?.title ?? "",
        submission.attemptNumber,
        homework?.maxAttempts ?? 0
      );
      if (submission.isLate) message += botMessages.latePenaltyNote(submission.penalty);
      await ctx.reply(message);
    } catch (error) {
      // Отказ сервиса — понятный текст ученику, остальное в журнал
      const code = this.errorCode(error);
      await this.logEvent({
        studentId,
        homeworkId,
        status: code ? "rejected" : "error",
        reason: code ?? (error instanceof Error ? error.message : "unknown_error"),
        fileName: document.fileName,
      });

      if (code) {
        await ctx.reply(SUBMIT_ERROR_MESSAGES[code] ?? botMessages.submitError(code));
        return;
      }
      this.logger.error(`Сдача через бота не прошла: ${String(error)}`);
      await ctx.reply(botMessages.uploadFailed);
    }
  }

  /** Ключ ошибки из исключения Nest: их же понимает словарь бота. */
  private errorCode(error: unknown): string | null {
    const response = (error as { response?: { message?: unknown } })?.response;
    const message = response?.message;
    return typeof message === "string" ? message : null;
  }

  private async logEvent(input: {
    studentId: string;
    homeworkId: string;
    status: "accepted" | "rejected" | "error";
    reason?: string;
    fileName?: string;
    details?: Record<string, unknown>;
  }) {
    await this.audit
      .record({
        userId: input.studentId,
        entityType: "TelegramSubmission",
        entityId: input.homeworkId,
        action: "CREATE",
        metadata: {
          status: input.status,
          reason: input.reason,
          fileName: input.fileName,
          ...(input.details ?? {}),
        },
      })
      .catch(() => undefined);
  }

  // ─── Вспомогательное ──────────────────────────────────────────────────

  private documentOf(ctx: Context): TelegramDocumentMeta | null {
    const document = ctx.message?.document ?? ctx.callbackQuery?.message?.reply_to_message?.document;
    if (!document) return null;
    return {
      fileId: document.file_id,
      fileName: document.file_name || "file",
      mimeType: document.mime_type,
      fileSize: document.file_size,
    };
  }

  private rememberFile(file: PendingTelegramFile): string {
    this.forgetExpired();
    const token = randomBytes(8).toString("hex");
    this.pendingFiles.set(token, file);
    return token;
  }

  private takeFile(token: string, chatId: string): PendingTelegramFile | null {
    this.forgetExpired();
    const file = this.pendingFiles.get(token);
    if (!file || file.chatId !== chatId) return null;
    this.pendingFiles.delete(token);
    return file;
  }

  private forgetExpired() {
    const now = Date.now();
    for (const [token, file] of this.pendingFiles) {
      if (now - file.createdAt > PENDING_FILE_TTL_MS) this.pendingFiles.delete(token);
    }
  }

  private findUserByChatId(chatId: string) {
    return this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true, firstName: true, lastName: true, role: true, parentProgressNotifications: true },
    });
  }
}
