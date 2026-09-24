import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SmsService } from "../src/modules/notifications/sms.service";
import { TelegramBotService } from "../src/modules/notifications/telegram-bot.service";
import { WeeklyDigestService } from "../src/modules/parent-notifications/weekly-digest.service";
import { createUser, createTestApp, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

/**
 * Приглашение в Telegram, которое выдаёт администратор (план
 * PLAN-TELEGRAM-INVITE-2026-09-24). Бот в тестовом окружении не настроен по
 * умолчанию (TELEGRAM_BOT_USERNAME пуст) — большинству тестов он нужен, имя
 * задаём в beforeAll и возвращаем пустым в отдельном тесте на 409.
 */
describe("модуль users: приглашение в Telegram", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_USERNAME = "bd_test_bot";
    app = await createTestApp();

    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user, { roleInToken: role });
    }

    // Отдельный ученик с телефоном — на нём проверяем SMS и TTL, не смешивая
    // с ролью-актёром STUDENT из матрицы прав
    const student = await createUser({ role: "STUDENT" });
    await testDb().user.update({ where: { id: student.id }, data: { phone: "+998901234567" } });
    ids.studentWithPhone = student.id;

    // Родитель без телефона — проверка «нет телефона → 400»
    const parentNoPhone = await createUser({ role: "PARENT" });
    ids.parentNoPhone = parentNoPhone.id;
  });

  afterAll(async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, role: string | null, body?: object) => {
    const req = http().post(`/api/v2${path}`).set("Origin", TEST_APP_URL);
    return (role ? req.set("Cookie", cookies[role]) : req).send(body);
  };

  describe("права", () => {
    const matrix: Array<[string, number]> = [
      ["TEACHER", 403],
      ["STUDENT", 403],
      ["PARENT", 403],
      ["ADMIN", 201],
    ];

    it.each(matrix)("POST /users/:id/telegram-invite под ролью %s → %i", async (role, expected) => {
      const res = await post(`/users/${ids.studentWithPhone}/telegram-invite`, role);
      expect(res.status).toBe(expected);
    });

    it("аноним не проходит дальше 401", async () => {
      const res = await post(`/users/${ids.studentWithPhone}/telegram-invite`, null);
      expect(res.status).toBe(401);
    });
  });

  describe("ссылка-приглашение", () => {
    it("возвращает url с кодом, срок — 7 дней, isLinked отражает статус", async () => {
      const before = Date.now();
      const res = await post(`/users/${ids.studentWithPhone}/telegram-invite`, "ADMIN");
      expect(res.status).toBe(201);

      const match = /^https:\/\/t\.me\/bd_test_bot\?start=([0-9a-f]{32})$/.exec(res.body.url);
      expect(match).not.toBeNull();
      expect(res.body.isLinked).toBe(false);

      const code = match![1];
      const stored = await testDb().telegramLinkRequest.findUnique({ where: { code } });
      expect(stored?.userId).toBe(ids.studentWithPhone);

      // TTL 7 дней (а не 15 минут, как код из профиля) — с запасом на время теста
      const ttlMs = new Date(res.body.expiresAt).getTime() - before;
      expect(ttlMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
      expect(ttlMs).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
    });

    it("повторное открытие приглашения отдаёт ту же ссылку, пока она действует", async () => {
      // Ссылка могла уже уйти родителю по SMS — новое открытие окна не
      // должно её гасить
      const first = await post(`/users/${ids.studentWithPhone}/telegram-invite`, "ADMIN");
      const second = await post(`/users/${ids.studentWithPhone}/telegram-invite`, "ADMIN");
      expect(second.body.url).toBe(first.body.url);
    });

    it("код из профиля (15 минут) не переиспользуется как приглашение — выдаётся новый недельный", async () => {
      const user = await createUser({ role: "PARENT" });
      await testDb().telegramLinkRequest.create({
        data: { code: "f".repeat(32), userId: user.id, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
      });
      const res = await post(`/users/${user.id}/telegram-invite`, "ADMIN");
      expect(res.body.url).not.toContain("f".repeat(32));
      const days = (new Date(res.body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
    });

    it("уже привязанному пользователю тоже выдаёт ссылку, но isLinked: true", async () => {
      const linked = await createUser({ role: "STUDENT", telegramChatId: "555" });
      const res = await post(`/users/${linked.id}/telegram-invite`, "ADMIN");
      expect(res.status).toBe(201);
      expect(res.body.isLinked).toBe(true);
    });

    it("бот не настроен — 409", async () => {
      delete process.env.TELEGRAM_BOT_USERNAME;
      const res = await post(`/users/${ids.studentWithPhone}/telegram-invite`, "ADMIN");
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("botNotConfigured");
      process.env.TELEGRAM_BOT_USERNAME = "bd_test_bot";
    });

    it("неизвестный пользователь — 404", async () => {
      const res = await post("/users/does-not-exist/telegram-invite", "ADMIN");
      expect(res.status).toBe(404);
    });
  });

  // Родитель привязывает СВОЙ Telegram: бот должен говорить с ним о ребёнке,
  // а не предлагать сдавать задания, как ученику
  describe("/start <код> у родителя", () => {
    it("ответ — про ребёнка, без /homework и загрузки кода", async () => {
      const parent = await createUser({ role: "PARENT" });
      const child = await createUser({ role: "STUDENT" });
      await testDb().parentStudent.create({ data: { parentId: parent.id, studentId: child.id } });

      const res = await post(`/users/${parent.id}/telegram-invite`, "ADMIN");
      const code = /start=([0-9a-f]{32})/.exec(res.body.url)![1];

      const replies: string[] = [];
      const fakeCtx = {
        chat: { id: 555000111 },
        from: { username: "parent_user" },
        reply: async (text: string) => {
          replies.push(text);
        },
      };
      const bot = app.get(TelegramBotService);
      await (
        bot as unknown as { handleLinkAccount(ctx: typeof fakeCtx, code: string): Promise<void> }
      ).handleLinkAccount(fakeCtx, code);

      expect(replies).toHaveLength(1);
      expect(replies[0]).toContain(child.firstName);
      expect(replies[0]).toContain("/progress");
      expect(replies[0]).not.toContain("/homework");

      // Сводка для /progress собирается по ребёнку родителя
      const summaries = await app.get(WeeklyDigestService).summariesForParent(parent.id);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toContain(child.firstName);
    });
  });

  describe("/start <код>: привязка проходит тем же путём, что и у бота", () => {
    it("после подтверждения кода Telegram привязан", async () => {
      const res = await post(`/users/${ids.studentWithPhone}/telegram-invite`, "ADMIN");
      const code = /start=([0-9a-f]{32})/.exec(res.body.url)![1];

      // handleLinkAccount приватный — тот же путь, что использует бот на
      // /start <код> (telegram-bot.service.ts), вызываем его напрямую тестовым
      // контекстом grammY вместо поднятия настоящего вебхука
      const bot = app.get(TelegramBotService);
      const fakeCtx = {
        chat: { id: 987654321 },
        from: { username: "invited_user" },
        reply: async () => undefined,
      };
      await (
        bot as unknown as { handleLinkAccount(ctx: typeof fakeCtx, code: string): Promise<void> }
      ).handleLinkAccount(fakeCtx, code);

      const user = await testDb().user.findUnique({ where: { id: ids.studentWithPhone } });
      expect(user?.telegramChatId).toBe("987654321");

      // Повторный запрос приглашения теперь честно отражает статус
      const after = await post(`/users/${ids.studentWithPhone}/telegram-invite`, "ADMIN");
      expect(after.body.isLinked).toBe(true);

      // Откатываем, чтобы не задеть остальные тесты в этом файле
      await testDb().user.update({
        where: { id: ids.studentWithPhone },
        data: { telegramChatId: null, telegramUsername: null },
      });
    });
  });

  describe("SMS", () => {
    it("sendOne вызывается с телефоном пользователя", async () => {
      const sms = app.get(SmsService);
      const spy = vi.spyOn(sms, "sendOne").mockResolvedValue({ sent: true });

      const res = await post(`/users/${ids.studentWithPhone}/telegram-invite/sms`, "ADMIN");
      expect(res.status).toBe(201);
      expect(res.body.sent).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      const call = spy.mock.calls[0][0];
      expect(call.phone).toBe("+998901234567");
      expect(call.userId).toBe(ids.studentWithPhone);
      expect(call.text).toContain("https://t.me/bd_test_bot?start=");

      spy.mockRestore();
    });

    it("нет телефона — 400", async () => {
      const res = await post(`/users/${ids.parentNoPhone}/telegram-invite/sms`, "ADMIN");
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("noPhone");
    });

    it("только администратор", async () => {
      for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
        const res = await post(`/users/${ids.studentWithPhone}/telegram-invite/sms`, role);
        expect(res.status).toBe(403);
      }
    });
  });
});
