import { Bot, InlineKeyboard, type Context } from "grammy";
import { prisma } from "@/lib/prisma";
import { submitSolutionInternal } from "@/actions/homework-actions";
import type { ProgrammingLanguage } from "@/generated/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PENDING_FILE_TTL_MS = 10 * 60 * 1000;

let botInstance: Bot | null = null;

interface TelegramDocumentMeta {
  fileId: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}

interface PendingTelegramFile extends TelegramDocumentMeta {
  chatId: string;
  kind: "code" | "file";
  createdAt: number;
}

const pendingTelegramFiles = new Map<string, PendingTelegramFile>();

function cleanupPendingTelegramFiles() {
  const now = Date.now();
  for (const [token, file] of pendingTelegramFiles) {
    if (now - file.createdAt > PENDING_FILE_TTL_MS) {
      pendingTelegramFiles.delete(token);
    }
  }
}

function createPendingTelegramFileToken(file: PendingTelegramFile): string {
  cleanupPendingTelegramFiles();
  const token = randomBytes(8).toString("hex");
  pendingTelegramFiles.set(token, file);
  return token;
}

function takePendingTelegramFile(token: string, chatId: string): PendingTelegramFile | null {
  cleanupPendingTelegramFiles();
  const file = pendingTelegramFiles.get(token);
  if (!file || file.chatId !== chatId) return null;
  pendingTelegramFiles.delete(token);
  return file;
}

function getDocumentMetaFromContext(ctx: Context): TelegramDocumentMeta | null {
  const doc = ctx.message?.document || ctx.callbackQuery?.message?.reply_to_message?.document;
  if (!doc) return null;
  return {
    fileId: doc.file_id,
    fileName: doc.file_name || "file",
    mimeType: doc.mime_type,
    fileSize: doc.file_size,
  };
}

async function logTelegramSubmissionEvent(input: {
  userId: string;
  homeworkId?: string;
  status: "accepted" | "rejected" | "error";
  reason?: string;
  fileName?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        entityType: "TelegramSubmission",
        entityId: input.homeworkId || "unknown",
        action: "CREATE",
        metadata: {
          status: input.status,
          reason: input.reason,
          fileName: input.fileName,
          ...(input.details || {}),
        },
      },
    });
  } catch (error) {
    console.error("Failed to write Telegram submission log:", error);
  }
}

export function getBot(): Bot {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  if (!botInstance) {
    botInstance = createBot(BOT_TOKEN);
  }
  return botInstance;
}

function createBot(token: string): Bot {
  const bot = new Bot(token);

  // Не даём одной упавшей команде обрушить webhook в 500:
  // иначе Telegram бесконечно ретраит апдейт и очередь бота встаёт.
  bot.catch((err) => {
    console.error("Telegram bot error:", err.error);
  });

  // /start — link account, confirm site login, or welcome
  bot.command("start", async (ctx) => {
    const linkCode = ctx.match;
    if (linkCode && linkCode.startsWith("login_")) {
      await handleLoginRequest(ctx, linkCode.slice("login_".length));
    } else if (linkCode) {
      await handleLinkAccount(ctx, linkCode);
    } else {
      const user = await findUserByChatId(String(ctx.chat.id));
      if (user) {
        await ctx.reply(
          `Вы привязаны как ${user.firstName} ${user.lastName}.\n\n` +
          "Команды:\n" +
          "/homework — активные задания\n" +
          "/unlink — отвязать аккаунт\n\n" +
          "Отправьте файл с кодом (.py, .js и т.д.) для проверки."
        );
      } else {
        await ctx.reply(
          "Привет! Привяжите аккаунт через личный кабинет на сайте.\n" +
          "Перейдите в Профиль → Привязать Telegram."
        );
      }
    }
  });

  // /homework — list active homework
  bot.command("homework", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) {
      await ctx.reply("Сначала привяжите аккаунт через сайт.");
      return;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: user.id },
      include: {
        course: {
          select: {
            title: true,
            lessons: {
              include: {
                homeworks: {
                  where: { isPublished: true },
                  select: {
                    id: true,
                    title: true,
                    language: true,
                    maxAttempts: true,
                    dueDate: true,
                    _count: {
                      select: {
                        submissions: { where: { studentId: user.id } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const homeworks: { id: string; title: string; courseName: string; attempts: string; due: string }[] = [];
    for (const enrollment of enrollments) {
      for (const lesson of enrollment.course.lessons) {
        for (const hw of lesson.homeworks) {
          const used = hw._count.submissions;
          const due = hw.dueDate
            ? new Date(hw.dueDate).toLocaleDateString("ru-RU")
            : "—";
          homeworks.push({
            id: hw.id,
            title: hw.title,
            courseName: enrollment.course.title,
            attempts: `${used}/${hw.maxAttempts}`,
            due,
          });
        }
      }
    }

    if (homeworks.length === 0) {
      await ctx.reply("У вас нет активных заданий.");
      return;
    }

    let message = "Активные задания:\n\n";
    for (const hw of homeworks) {
      message += `${hw.title}\n`;
      message += `  Курс: ${hw.courseName}\n`;
      message += `  Попытки: ${hw.attempts} | Дедлайн: ${hw.due}\n\n`;
    }
    message += "Отправьте файл с кодом для проверки.";

    await ctx.reply(message);
  });

  // /unlink — unlink account
  bot.command("unlink", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) {
      await ctx.reply("Аккаунт не привязан.");
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: null, telegramUsername: null },
    });
    await ctx.reply("Аккаунт отвязан. Привяжите заново через сайт.");
  });

  // Handle file submissions
  bot.on("message:document", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) {
      await ctx.reply("Сначала привяжите аккаунт через сайт.");
      return;
    }

      const doc = getDocumentMetaFromContext(ctx);
      if (!doc) {
        await ctx.reply("Не удалось получить файл.");
        return;
      }
      const fileName = doc.fileName;
      const ext = fileName.split(".").pop()?.toLowerCase();

    const codeExtensions = ["py", "js", "ts", "php", "java", "cs"];
    const isCodeFile = ext && codeExtensions.includes(ext);

    if (isCodeFile) {
      // CODE homework flow
      if (doc.fileSize && doc.fileSize > 100 * 1024) {
        await ctx.reply("Файл слишком большой (макс. 100 КБ).");
        return;
      }

      const langMap: Record<string, string> = {
        py: "PYTHON",
        js: "JAVASCRIPT",
        ts: "TYPESCRIPT",
        php: "PHP",
        java: "JAVA",
        cs: "CSHARP",
      };
      const language = langMap[ext] as ProgrammingLanguage;

      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.id },
        include: {
          course: {
            select: {
              title: true,
              lessons: {
                include: {
                  homeworks: {
                    where: { isPublished: true, language },
                    select: { id: true, title: true, maxAttempts: true },
                  },
                },
              },
            },
          },
        },
      });

      const matchingHomeworks: { id: string; title: string; courseName: string }[] = [];
      for (const enrollment of enrollments) {
        for (const lesson of enrollment.course.lessons) {
          for (const hw of lesson.homeworks) {
            matchingHomeworks.push({
              id: hw.id,
              title: hw.title,
              courseName: enrollment.course.title,
            });
          }
        }
      }

      if (matchingHomeworks.length === 0) {
        await ctx.reply("Нет активных заданий для этого языка.");
        return;
      }

      if (matchingHomeworks.length === 1) {
        await processFileSubmission(ctx, user.id, matchingHomeworks[0].id, fileName, doc);
        return;
      }

      const token = createPendingTelegramFileToken({
        chatId: String(ctx.chat.id),
        kind: "code",
        createdAt: Date.now(),
        ...doc,
      });

      const keyboard = new InlineKeyboard();
      for (const hw of matchingHomeworks) {
        keyboard.text(`${hw.title} (${hw.courseName})`, `submit:${hw.id}:${token}`).row();
      }

      await ctx.reply("Выберите задание для проверки:", { reply_markup: keyboard });
    } else {
      // FILE homework flow — any non-code file
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      if (doc.fileSize && doc.fileSize > MAX_FILE_SIZE) {
        await ctx.reply("Файл слишком большой (макс. 5 МБ).");
        return;
      }

      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.id },
        include: {
          course: {
            select: {
              title: true,
              lessons: {
                include: {
                  homeworks: {
                    where: { isPublished: true, type: "FILE" },
                    select: { id: true, title: true, maxAttempts: true },
                  },
                },
              },
            },
          },
        },
      });

      const fileHomeworks: { id: string; title: string; courseName: string }[] = [];
      for (const enrollment of enrollments) {
        for (const lesson of enrollment.course.lessons) {
          for (const hw of lesson.homeworks) {
            fileHomeworks.push({
              id: hw.id,
              title: hw.title,
              courseName: enrollment.course.title,
            });
          }
        }
      }

      if (fileHomeworks.length === 0) {
        await ctx.reply("Нет заданий для загрузки файлов.");
        return;
      }

      if (fileHomeworks.length === 1) {
        await processFileUploadSubmission(ctx, user.id, fileHomeworks[0].id, fileName, doc);
        return;
      }

      const token = createPendingTelegramFileToken({
        chatId: String(ctx.chat.id),
        kind: "file",
        createdAt: Date.now(),
        ...doc,
      });

      const keyboard = new InlineKeyboard();
      for (const hw of fileHomeworks) {
        keyboard.text(`${hw.title} (${hw.courseName})`, `fileupload:${hw.id}:${token}`).row();
      }

      await ctx.reply("Выберите задание для загрузки файла:", { reply_markup: keyboard });
    }
  });

  // Handle inline keyboard callback for homework selection
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!ctx.chat) return;

    if (data.startsWith("tglogin:")) {
      await handleLoginConfirm(ctx, data.slice("tglogin:".length));
      return;
    }

    const isSubmit = data.startsWith("submit:");
    const isFileUpload = data.startsWith("fileupload:");
    if (!isSubmit && !isFileUpload) return;

    const [, homeworkId, token] = data.split(":");
    if (!homeworkId || !token) {
      await ctx.answerCallbackQuery({ text: "Отправьте файл заново." });
      return;
    }
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Аккаунт не привязан." });
      return;
    }

    await ctx.answerCallbackQuery();

    const pendingFile = takePendingTelegramFile(token, String(ctx.chat.id));
    if (!pendingFile) {
      await ctx.reply("Сессия выбора файла истекла. Отправьте файл заново.");
      return;
    }

    const fileName = pendingFile.fileName;

    if (isFileUpload) {
      await processFileUploadSubmission(ctx, user.id, homeworkId, fileName, pendingFile);
    } else {
      await processFileSubmission(ctx, user.id, homeworkId, fileName, pendingFile);
    }
  });

  return bot;
}

async function findValidLoginRequest(code: string) {
  if (!/^[0-9a-f]{32}$/.test(code)) return null;
  const request = await prisma.telegramAuthRequest.findUnique({
    where: { code },
  });
  if (!request || request.expiresAt < new Date()) return null;
  return request;
}

async function handleLoginRequest(ctx: Context, code: string) {
  if (!ctx.chat) return;

  const request = await findValidLoginRequest(code);
  if (!request) {
    await ctx.reply("Код входа не найден или истёк. Вернитесь на сайт и попробуйте снова.");
    return;
  }

  const keyboard = new InlineKeyboard().text(
    "✅ Подтвердить вход",
    `tglogin:${code}`
  );
  await ctx.reply(
    "Вход на сайт учебного центра.\n\n" +
      "Если это вы нажали «Войти через Telegram» на сайте — подтвердите вход. " +
      "Если нет — просто проигнорируйте это сообщение.",
    { reply_markup: keyboard }
  );
}

async function handleLoginConfirm(ctx: Context, code: string) {
  if (!ctx.chat || !ctx.from) return;

  const request = await findValidLoginRequest(code);
  if (!request || request.status !== "PENDING") {
    await ctx.answerCallbackQuery({ text: "Код входа не найден или истёк." });
    return;
  }

  await prisma.telegramAuthRequest.update({
    where: { id: request.id },
    data: {
      status: "CONFIRMED",
      telegramChatId: String(ctx.chat.id),
      telegramUsername: ctx.from.username || null,
      firstName: ctx.from.first_name || null,
      lastName: ctx.from.last_name || null,
    },
  });

  await ctx.answerCallbackQuery({ text: "Вход подтверждён" });
  await ctx.reply("Вход подтверждён ✅ Вернитесь на сайт — вы будете авторизованы автоматически.");
}

async function handleLinkAccount(ctx: Context, linkCode: string) {
  if (!ctx.chat) return;

  // Find pending link by code (stored as telegramChatId temporarily with prefix)
  const pendingUser = await prisma.user.findFirst({
    where: { telegramChatId: `pending:${linkCode}` },
  });

  if (!pendingUser) {
    await ctx.reply("Код привязки не найден или истёк. Попробуйте заново через сайт.");
    return;
  }

  // Этот Telegram может быть уже занят другим аккаунтом
  // (например, автосозданным при входе через Telegram)
  const holder = await prisma.user.findUnique({
    where: { telegramChatId: String(ctx.chat.id) },
  });
  if (holder && holder.id !== pendingUser.id) {
    await prisma.user.update({
      where: { id: pendingUser.id },
      data: { telegramChatId: null },
    });
    await ctx.reply(
      `Этот Telegram уже привязан к аккаунту ${holder.firstName} ${holder.lastName}.\n` +
      "Сначала отвяжите его в профиле того аккаунта (или попросите администратора), затем повторите привязку."
    );
    return;
  }

  await prisma.user.update({
    where: { id: pendingUser.id },
    data: {
      telegramChatId: String(ctx.chat.id),
      telegramUsername: ctx.from?.username || null,
    },
  });

  await ctx.reply(
    `Аккаунт привязан! ${pendingUser.firstName} ${pendingUser.lastName}\n\n` +
    "Теперь вы можете отправлять файлы с кодом для автоматической проверки.\n" +
    "/homework — просмотр заданий"
  );
}

async function processFileSubmission(
  ctx: Context,
  studentId: string,
  homeworkId: string,
  fileName: string,
  sourceFile?: TelegramDocumentMeta
) {
  const doc = sourceFile || getDocumentMetaFromContext(ctx);
  if (!doc) {
    await logTelegramSubmissionEvent({
      userId: studentId,
      homeworkId,
      status: "error",
      reason: "document_not_found",
      fileName,
    });
    await ctx.reply("Не удалось получить файл.");
    return;
  }

  await ctx.reply(`Проверяю ${fileName}...`);

  try {
    const file = await getBot().api.getFile(doc.fileId);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(url);
    const code = await response.text();

    if (!code.trim()) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "empty_file",
        fileName,
      });
      await ctx.reply("Файл пустой.");
      return;
    }

    const result = await submitSolutionInternal(homeworkId, code, studentId);

    if (!result.success) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: result.error,
        fileName,
      });
      const errorMessages: Record<string, string> = {
        homeworkNotFound: "Задание не найдено.",
        homeworkNotPublished: "Задание не опубликовано.",
        languageNotSpecified: "Язык не указан.",
        notEnrolled: "Вы не записаны на курс.",
        deadlineExpired: "Дедлайн истёк.",
        maxAttemptsReached: "Попытки закончились.",
      };
      await ctx.reply(errorMessages[result.error] || `Ошибка: ${result.error}`);
      return;
    }

    await logTelegramSubmissionEvent({
      userId: studentId,
      homeworkId,
      status: "accepted",
      fileName,
      details: {
        type: "CODE",
      },
    });
    await ctx.reply("Ваша работа принята системой проверки.");

    const d = result.data;
    const statusEmoji: Record<string, string> = {
      PASSED: "\u2705",
      PARTIAL: "\u26a0\ufe0f",
      FAILED: "\u274c",
      ERROR: "\u274c",
    };

    let message = `${statusEmoji[d.status] || ""} Результат: ${d.passed}/${d.total} тестов (${d.percentage}%)`;
    if (d.finalScore !== d.percentage) {
      message += `\nИтого со штрафом: ${d.finalScore}%`;
    }

    const errors = d.testResults
      .filter((r) => r.error)
      .map((r) => r.error)
      .filter((e, i, arr) => arr.indexOf(e) === i);

    if (errors.length > 0) {
      message += "\n\nОшибки:\n" + errors.join("\n");
    }

    // Trim long messages
    if (message.length > 4000) {
      message = message.slice(0, 4000) + "...";
    }

    await ctx.reply(message);
  } catch (error) {
    console.error("Telegram submission error:", error);
    await logTelegramSubmissionEvent({
      userId: studentId,
      homeworkId,
      status: "error",
      reason: error instanceof Error ? error.message : "unknown_error",
      fileName,
    });
    await ctx.reply("Ошибка при проверке. Попробуйте позже.");
  }
}

const UPLOAD_DIR = path.join(process.cwd(), "public/uploads/homework");

async function processFileUploadSubmission(
  ctx: Context,
  studentId: string,
  homeworkId: string,
  fileName: string,
  sourceFile?: TelegramDocumentMeta
) {
  const doc = sourceFile || getDocumentMetaFromContext(ctx);
  if (!doc) {
    await logTelegramSubmissionEvent({
      userId: studentId,
      homeworkId,
      status: "error",
      reason: "document_not_found",
      fileName,
    });
    await ctx.reply("Не удалось получить файл.");
    return;
  }

  try {
    // Fetch homework with enrollment check
    const homework = await prisma.homework.findUnique({
      where: { id: homeworkId },
      include: {
        lesson: {
          include: {
            course: {
              include: {
                enrollments: {
                  where: { studentId },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!homework || !homework.isPublished) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "homework_not_found_or_unpublished",
        fileName,
      });
      await ctx.reply("Задание не найдено или не опубликовано.");
      return;
    }

    if (homework.lesson.course.enrollments.length === 0) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "not_enrolled",
        fileName,
      });
      await ctx.reply("Вы не записаны на курс.");
      return;
    }

    // Check deadline
    const now = new Date();
    const isLate = homework.dueDate ? homework.dueDate < now : false;
    if (isLate && !homework.allowLate) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "deadline_expired",
        fileName,
      });
      await ctx.reply("Дедлайн истёк.");
      return;
    }
    const penalty = isLate ? homework.latePenalty : 0;

    // Check attempts
    const attemptCount = await prisma.submission.count({
      where: { homeworkId, studentId },
    });

    if (attemptCount >= homework.maxAttempts) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "max_attempts_reached",
        fileName,
      });
      await ctx.reply("Попытки закончились.");
      return;
    }

    await ctx.reply(`Загружаю ${fileName}...`);

    // Download file from Telegram
    const file = await getBot().api.getFile(doc.fileId);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "empty_file",
        fileName,
      });
      await ctx.reply("Файл пустой.");
      return;
    }

    if (buffer.length > 5 * 1024 * 1024) {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "file_too_large",
        fileName,
      });
      await ctx.reply("Файл слишком большой (макс. 5 МБ).");
      return;
    }

    // Save file to disk
    const ext = path.extname(fileName) || "";
    const safeFilename = `${homeworkId}_${studentId}_${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(filePath, buffer);

    // Create submission + file in transaction
    const submission = await prisma.$transaction(async (tx) => {
      const count = await tx.submission.count({
        where: { homeworkId, studentId },
      });

      if (count >= homework.maxAttempts) {
        throw new Error("MAX_ATTEMPTS_REACHED");
      }

      return tx.submission.create({
        data: {
          homeworkId,
          studentId,
          code: `[Файл: ${fileName}]`,
          status: "PENDING",
          attemptNumber: count + 1,
          isLate,
          penalty,
          manualStatus: "PENDING",
          files: {
            create: {
              filename: fileName,
              path: filePath,
              mimeType: doc.mimeType || "application/octet-stream",
              size: buffer.length,
            },
          },
        },
      });
    });

    await logTelegramSubmissionEvent({
      userId: studentId,
      homeworkId,
      status: "accepted",
      fileName,
      details: {
        type: "FILE",
        submissionId: submission.id,
      },
    });
    await ctx.reply("Ваша работа принята системой проверки.");

    let message = `Файл отправлен на проверку!\n\n`;
    message += `Задание: ${homework.title}\n`;
    message += `Попытка: ${submission.attemptNumber}/${homework.maxAttempts}\n`;
    message += `Статус: На проверке`;
    if (isLate) {
      message += `\n⚠️ Отправлено после дедлайна (штраф ${penalty}%)`;
    }

    await ctx.reply(message);
  } catch (error) {
    if (error instanceof Error && error.message === "MAX_ATTEMPTS_REACHED") {
      await logTelegramSubmissionEvent({
        userId: studentId,
        homeworkId,
        status: "rejected",
        reason: "max_attempts_reached",
        fileName,
      });
      await ctx.reply("Попытки закончились.");
      return;
    }
    console.error("Telegram file upload error:", error);
    await logTelegramSubmissionEvent({
      userId: studentId,
      homeworkId,
      status: "error",
      reason: error instanceof Error ? error.message : "unknown_error",
      fileName,
    });
    await ctx.reply("Ошибка при загрузке файла. Попробуйте позже.");
  }
}

async function findUserByChatId(chatId: string) {
  return prisma.user.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
}
