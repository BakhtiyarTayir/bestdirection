import { Bot, InlineKeyboard, type Context } from "grammy";
import { prisma } from "@/lib/prisma";
import { submitSolutionInternal } from "@/actions/homework-actions";
import type { ProgrammingLanguage } from "@/generated/prisma";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let botInstance: Bot | null = null;

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

  // /start — link account or welcome
  bot.command("start", async (ctx) => {
    const linkCode = ctx.match;
    if (linkCode) {
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

    const doc = ctx.message.document;
    const fileName = doc.file_name || "";
    const ext = fileName.split(".").pop()?.toLowerCase();

    const allowedExtensions = ["py", "js", "ts", "php", "java", "cs"];
    if (!ext || !allowedExtensions.includes(ext)) {
      await ctx.reply(
        `Неподдерживаемый тип файла. Допустимые: ${allowedExtensions.map((e) => "." + e).join(", ")}`
      );
      return;
    }

    if (doc.file_size && doc.file_size > 100 * 1024) {
      await ctx.reply("Файл слишком большой (макс. 100 КБ).");
      return;
    }

    // Find active homeworks matching the file's language
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
      // Auto-submit to the only matching homework
      await processFileSubmission(ctx, user.id, matchingHomeworks[0].id, fileName);
      return;
    }

    // Show inline keyboard to pick homework
    const keyboard = new InlineKeyboard();
    for (const hw of matchingHomeworks) {
      keyboard.text(`${hw.title} (${hw.courseName})`, `submit:${hw.id}`).row();
    }

    await ctx.reply("Выберите задание для проверки:", { reply_markup: keyboard });
  });

  // Handle inline keyboard callback for homework selection
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("submit:") || !ctx.chat) return;

    const homeworkId = data.replace("submit:", "");
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Аккаунт не привязан." });
      return;
    }

    await ctx.answerCallbackQuery();

    // Get the original document from the replied message
    const message = ctx.callbackQuery.message;
    const replyTo = message?.reply_to_message;
    if (!replyTo?.document) {
      await ctx.reply("Отправьте файл заново.");
      return;
    }

    await processFileSubmission(ctx, user.id, homeworkId, replyTo.document.file_name || "file");
  });

  return bot;
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

async function processFileSubmission(ctx: Context, studentId: string, homeworkId: string, fileName: string) {
  const doc = ctx.message?.document || ctx.callbackQuery?.message?.reply_to_message?.document;
  if (!doc) {
    await ctx.reply("Не удалось получить файл.");
    return;
  }

  await ctx.reply(`Проверяю ${fileName}...`);

  try {
    const file = await getBot().api.getFile(doc.file_id);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(url);
    const code = await response.text();

    if (!code.trim()) {
      await ctx.reply("Файл пустой.");
      return;
    }

    const result = await submitSolutionInternal(homeworkId, code, studentId);

    if (!result.success) {
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
    await ctx.reply("Ошибка при проверке. Попробуйте позже.");
  }
}

async function findUserByChatId(chatId: string) {
  return prisma.user.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
}
