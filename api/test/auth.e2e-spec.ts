import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";
import { TelegramNotifyService } from "../src/common/telegram/telegram-notify.service";

// Предел попыток входа в тестах поднят через vitest.config.mts: проверок
// здесь больше, чем разрешено в проде.
//
// Почта убрана целиком (шаг 2 отказа от почты, PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md,
// 4.1): вход только по логину, самостоятельная регистрация закрыта, сброс
// пароля без администратора — только через Telegram.

/** Сообщения в Telegram никуда не уходят: запоминаем, куда и что «отправили». */
class TelegramNotifyStub {
  readonly sent: { chatId: string; text: string }[] = [];

  async send(chatId: string | null | undefined, text: string) {
    if (!chatId) return;
    this.sent.push({ chatId, text });
  }
}

describe("вход и сессии", () => {
  let app: TestApp;
  const run = Date.now().toString(36);
  const password = "pravilnyy-parol-123";
  const loginOf = (name: string) => `${name}-${run}`;

  const telegram = new TelegramNotifyStub();

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: TelegramNotifyService, useValue: telegram }],
    });

    await testDb().user.create({
      data: {
        login: loginOf("student"),
        passwordHash: await bcrypt.hash(password, 10),
        firstName: "Иван",
        lastName: "Петров",
        role: "STUDENT",
      },
    });

    await testDb().user.create({
      data: {
        login: loginOf("vyklyuchennyy"),
        passwordHash: await bcrypt.hash(password, 10),
        firstName: "Выключенный",
        lastName: "Аккаунт",
        role: "STUDENT",
        isActive: false,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body?: object, cookie?: string) => {
    const req = http().post(`/api/v2${path}`).set("Origin", TEST_APP_URL);
    return (cookie ? req.set("Cookie", cookie) : req).send(body);
  };
  const sessionCookieOf = (res: request.Response): string | undefined => {
    const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
    return raw?.find((value) => value.startsWith("bd_session="))?.split(";")[0];
  };

  describe("вход по паролю", () => {
    it("верный пароль заводит сессию и ставит куку", async () => {
      const res = await post("/auth/login", { login: loginOf("student"), password });
      expect(res.status).toBe(201);
      expect(res.body.user.login).toBe(loginOf("student"));

      const cookie = sessionCookieOf(res);
      expect(cookie).toBeTruthy();

      const raw = res.headers["set-cookie"] as unknown as string[];
      const header = raw.find((value) => value.startsWith("bd_session="))!;
      // Кука недоступна скриптам и не уезжает на чужие сайты
      expect(header.toLowerCase()).toContain("httponly");
      expect(header.toLowerCase()).toContain("samesite=lax");

      const me = await http().get("/api/v2/auth/me").set("Cookie", cookie!);
      expect(me.status).toBe(200);
      expect(me.body.role).toBe("STUDENT");
    });

    it("в базе лежит хэш токена, а не сам токен", async () => {
      const res = await post("/auth/login", { login: loginOf("student"), password });
      const cookie = sessionCookieOf(res)!;
      const token = cookie.split("=")[1];

      const rows = await testDb().session.findMany({ select: { tokenHash: true } });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.tokenHash !== token)).toBe(true);
    });

    it("неверный пароль, неизвестный логин и выключенный аккаунт отвечают одинаково", async () => {
      const wrongPassword = await post("/auth/login", {
        login: loginOf("student"),
        password: "nepravilnyy-parol",
      });
      const unknownLogin = await post("/auth/login", {
        login: loginOf("takogo-net"),
        password,
      });
      const disabled = await post("/auth/login", {
        login: loginOf("vyklyuchennyy"),
        password,
      });

      // Аудит 2.12: по ответу нельзя понять, заведён ли логин
      for (const res of [wrongPassword, unknownLogin, disabled]) {
        expect(res.status).toBe(401);
        expect(res.body.message).toBe("invalidCredentials");
      }
    });
  });

  describe("выход и обрыв сессий", () => {
    it("после выхода кука больше не пускает", async () => {
      const login = await post("/auth/login", { login: loginOf("student"), password });
      const cookie = sessionCookieOf(login)!;

      expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(200);

      const out = await post("/auth/logout", undefined, cookie);
      expect(out.status).toBe(201);

      expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(401);
    });

    // Смена пароля обрывает все сессии (аудит 2.1) — покрыто ниже для обоих
    // путей смены: администратором (api/test/users.e2e-spec.ts, «PATCH с
    // password…») и самим пользователем через Telegram («сброс пароля через
    // Telegram» дальше в этом файле). Почтового пути с шага 2 больше нет.

    it("истёкшая сессия не пускает", async () => {
      const login = await post("/auth/login", { login: loginOf("student"), password });
      const cookie = sessionCookieOf(login)!;

      const rows = await testDb().session.findMany({ orderBy: { createdAt: "desc" }, take: 1 });
      await testDb().session.update({
        where: { id: rows[0].id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(401);
      // Просроченную строку заодно убираем
      expect(await testDb().session.findUnique({ where: { id: rows[0].id } })).toBeNull();
    });

    it("выключение аккаунта обрывает открытую сессию (аудит 2.1)", async () => {
      const user = await testDb().user.create({
        data: {
          login: loginOf("otklyuchat"),
          passwordHash: await bcrypt.hash(password, 10),
          firstName: "Будет",
          lastName: "Выключен",
          role: "STUDENT",
        },
      });
      const cookie = sessionCookieOf(await post("/auth/login", { login: user.login!, password }))!;
      expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(200);

      const admin = await createUser({ role: "ADMIN" });
      const adminCookie = await sessionCookie(admin, { roleInToken: "ADMIN" });
      const off = await http()
        .post(`/api/v2/users/${user.id}/deactivate`)
        .set("Cookie", adminCookie)
        .set("Origin", TEST_APP_URL)
        .send();
      expect(off.status).toBe(201);

      // Прежняя вкладка теряет доступ сразу, а не через 30 дней
      expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(401);
    });

    it("подделанный токен не пускает", async () => {
      const res = await http()
        .get("/api/v2/auth/me")
        .set("Cookie", `bd_session=${"a".repeat(64)}`);
      expect(res.status).toBe(401);
    });
  });

  // Самостоятельная регистрация и почтовый сброс пароля убраны целиком на
  // шаге 2 отказа от почты: маршрутов /auth/email/*, /auth/register и
  // /auth/password/request-reset|reset в api больше нет, проверять нечего.
  // Учеников заводит администратор (api/test/users.e2e-spec.ts), сброс без
  // администратора — только через Telegram (см. ниже).

  describe("совместимость со старой сессией web", () => {
    it("кука NextAuth пока тоже пускает", async () => {
      const user = await createUser({ role: "TEACHER" });
      const legacy = await sessionCookie(user, { roleInToken: "TEACHER" });

      const res = await http().get("/api/v2/auth/me").set("Cookie", legacy);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("TEACHER");
    });
  });

  // Формат и регистр логина (шаг 2 отказа от почты, PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1)
  describe("вход по логину", () => {
    it("регистр логина не влияет на вход", async () => {
      const user = await createUser({ role: "STUDENT", password });
      // В базе логин всегда в нижнем регистре (DTO приводит на входе) —
      // проверяем, что ВХОДЯЩЕЕ значение приводится так же, до сравнения
      await testDb().user.update({ where: { id: user.id }, data: { login: `mixedcase-${user.id}` } });

      const res = await post("/auth/login", { login: `MixedCase-${user.id}`, password });
      expect(res.status).toBe(201);
      expect(res.body.user.id).toBe(user.id);
    });

    it("неизвестный логин отвечает так же, как неверный пароль (аудит 2.12)", async () => {
      const res = await post("/auth/login", { login: "net-takogo-logina", password });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("invalidCredentials");
    });
  });

  // Единственный самостоятельный путь сброса пароля после ухода почты (4.1, «Путь 2»)
  describe("сброс пароля через Telegram", () => {
    it("неизвестный логин отвечает нейтрально и не шлёт сообщение", async () => {
      const before = telegram.sent.length;
      const res = await post("/auth/password/telegram/request-code", { login: "prizrak-nikogda-ne-byl" });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
      expect(telegram.sent.length).toBe(before);
    });

    it("логин без привязанного Telegram отвечает так же нейтрально", async () => {
      const user = await createUser({ role: "STUDENT", password });
      await testDb().user.update({ where: { id: user.id }, data: { login: `notg-${user.id}` } });

      const before = telegram.sent.length;
      const res = await post("/auth/password/telegram/request-code", { login: `notg-${user.id}` });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
      expect(telegram.sent.length).toBe(before);
    });

    it("код уходит в привязанный чат, неверный код не меняет пароль, верный — меняет и рвёт все сессии", async () => {
      const user = await createUser({ role: "STUDENT", password, telegramChatId: `tg-reset-${Date.now()}` });
      const login = `sbros-tg-${user.id}`;
      await testDb().user.update({ where: { id: user.id }, data: { login } });

      const firstSession = sessionCookieOf(await post("/auth/login", { login, password }))!;

      const before = telegram.sent.length;
      const requested = await post("/auth/password/telegram/request-code", { login });
      expect(requested.status).toBe(201);
      expect(telegram.sent.length).toBe(before + 1);
      expect(telegram.sent.at(-1)!.chatId).toBe(user.telegramChatId);

      const code = telegram.sent.at(-1)!.text.match(/\d{6}/)?.[0];
      expect(code).toBeTruthy();

      const wrongCode = await post("/auth/password/telegram/reset", {
        login,
        code: "000000",
        newPassword: "novyy-tg-parol-123",
      });
      expect(wrongCode.status).toBe(400);
      expect(wrongCode.body.message).toBe("invalidCode");
      // Сессия, открытая до сброса, ещё жива — неверный код ничего не сломал
      expect((await http().get("/api/v2/auth/me").set("Cookie", firstSession)).status).toBe(200);

      const ok = await post("/auth/password/telegram/reset", {
        login,
        code: code!,
        newPassword: "novyy-tg-parol-123",
      });
      expect(ok.status).toBe(201);

      // Смена пароля обрывает все сессии, включая ту, что была открыта до сброса
      expect((await http().get("/api/v2/auth/me").set("Cookie", firstSession)).status).toBe(401);
      expect((await post("/auth/login", { login, password: "novyy-tg-parol-123" })).status).toBe(201);
    });
  });

  // findOrCreateTelegramUser → requireTelegramUser (4.1): незнакомцу больше
  // не заводится учётная запись — учеников заводит администратор
  describe("вход через Telegram не заводит незнакомцев", () => {
    it("код от неизвестного chatId отвечает telegramUnknown и не создаёт строку", async () => {
      const before = await testDb().user.count();

      const request = await testDb().telegramAuthRequest.create({
        data: {
          code: randomBytes(16).toString("hex"),
          status: "CONFIRMED",
          telegramChatId: `unknown-chat-${Date.now()}`,
          firstName: "Незнакомец",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const res = await post("/auth/telegram/code", { code: request.code });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("telegramUnknown");

      expect(await testDb().user.count()).toBe(before);
    });
  });
});
