import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";
import { hashVerificationCode } from "../src/common/email/codes";
import { EmailService } from "../src/common/email/email.service";
import { TelegramNotifyService } from "../src/common/telegram/telegram-notify.service";

// Предел попыток входа в тестах поднят через vitest.config.mts: проверок
// здесь больше, чем разрешено в проде.

/** Письма никуда не уходят: запоминаем, кому и какой код «отправили». */
class EmailStub {
  readonly sent: { to: string; code: string; kind: string }[] = [];

  isConfigured() {
    return true;
  }

  async sendVerificationCode(to: string, code: string, _locale: string, kind = "register") {
    this.sent.push({ to, code, kind });
    return true;
  }
}

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
  const emailOf = (name: string) => `${name}-${run}@test.local`;

  const email = new EmailStub();
  const telegram = new TelegramNotifyStub();

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: EmailService, useValue: email },
        { provide: TelegramNotifyService, useValue: telegram },
      ],
    });

    await testDb().user.create({
      data: {
        email: emailOf("student"),
        passwordHash: await bcrypt.hash(password, 10),
        firstName: "Иван",
        lastName: "Петров",
        role: "STUDENT",
      },
    });

    await testDb().user.create({
      data: {
        email: emailOf("vyklyuchennyy"),
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
      const res = await post("/auth/login", { login: emailOf("student"), password });
      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe(emailOf("student"));

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
      const res = await post("/auth/login", { login: emailOf("student"), password });
      const cookie = sessionCookieOf(res)!;
      const token = cookie.split("=")[1];

      const rows = await testDb().session.findMany({ select: { tokenHash: true } });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.tokenHash !== token)).toBe(true);
    });

    it("неверный пароль, неизвестный адрес и выключенный аккаунт отвечают одинаково", async () => {
      const wrongPassword = await post("/auth/login", {
        login: emailOf("student"),
        password: "nepravilnyy-parol",
      });
      const unknownEmail = await post("/auth/login", {
        login: emailOf("takogo-net"),
        password,
      });
      const disabled = await post("/auth/login", {
        login: emailOf("vyklyuchennyy"),
        password,
      });

      // Аудит 2.12: по ответу нельзя понять, заведён ли адрес
      for (const res of [wrongPassword, unknownEmail, disabled]) {
        expect(res.status).toBe(401);
        expect(res.body.message).toBe("invalidCredentials");
      }
    });
  });

  describe("выход и обрыв сессий", () => {
    it("после выхода кука больше не пускает", async () => {
      const login = await post("/auth/login", { login: emailOf("student"), password });
      const cookie = sessionCookieOf(login)!;

      expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(200);

      const out = await post("/auth/logout", undefined, cookie);
      expect(out.status).toBe(201);

      expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(401);
    });

    it("смена пароля обрывает все сессии (аудит 2.1)", async () => {
      const user = await testDb().user.create({
        data: {
          email: emailOf("sbros"),
          passwordHash: await bcrypt.hash(password, 10),
          firstName: "Сброс",
          lastName: "Пароля",
          role: "STUDENT",
        },
      });

      const first = sessionCookieOf(
        await post("/auth/login", { login: user.email!, password })
      )!;
      const second = sessionCookieOf(
        await post("/auth/login", { login: user.email!, password })
      )!;

      // Код сброса кладём руками: письмо в тестах не уходит
      const code = "123456";
      await testDb().emailVerificationCode.create({
        data: {
          email: user.email!,
          codeHash: hashVerificationCode(user.email!, code),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const reset = await post("/auth/password/reset", {
        email: user.email,
        code,
        newPassword: "novyy-parol-12345",
      });
      expect(reset.status).toBe(201);

      for (const cookie of [first, second]) {
        expect((await http().get("/api/v2/auth/me").set("Cookie", cookie)).status).toBe(401);
      }

      // Новый пароль работает, старый — нет
      expect((await post("/auth/login", { login: user.email, password })).status).toBe(401);
      expect(
        (await post("/auth/login", { login: user.email, password: "novyy-parol-12345" })).status
      ).toBe(201);
    });

    it("истёкшая сессия не пускает", async () => {
      const login = await post("/auth/login", { login: emailOf("student"), password });
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
          email: emailOf("otklyuchat"),
          passwordHash: await bcrypt.hash(password, 10),
          firstName: "Будет",
          lastName: "Выключен",
          role: "STUDENT",
        },
      });
      const cookie = sessionCookieOf(await post("/auth/login", { login: user.email!, password }))!;
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

  describe("регистрация", () => {
    it("занятый адрес отвечает так же, как свободный (аудит 2.12)", async () => {
      const free = await post("/auth/email/request-code", { email: emailOf("svobodnyy") });
      const taken = await post("/auth/email/request-code", { email: emailOf("student") });

      // Ответы неотличимы — по ним нельзя проверить, кто зарегистрирован
      expect(free.status).toBe(taken.status);
      expect(free.body).toEqual(taken.body);
      expect(taken.body.ok).toBe(true);

      // Письмо и код появляются только у свободного адреса
      expect(email.sent.some((letter) => letter.to === emailOf("svobodnyy"))).toBe(true);
      expect(email.sent.some((letter) => letter.to === emailOf("student"))).toBe(false);
      expect(
        await testDb().emailVerificationCode.findUnique({ where: { email: emailOf("student") } })
      ).toBeNull();
    });

    it("регистрация проходит только с верным кодом", async () => {
      const email = emailOf("novichok");
      const code = "654321";
      await testDb().emailVerificationCode.create({
        data: {
          email,
          codeHash: hashVerificationCode(email, code),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const wrong = await post("/auth/register", {
        firstName: "Новый",
        lastName: "Ученик",
        email,
        password,
        code: "000000",
      });
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toBe("invalidCode");

      const ok = await post("/auth/register", {
        firstName: "Новый",
        lastName: "Ученик",
        email,
        password,
        code,
      });
      expect(ok.status).toBe(201);

      const created = await testDb().user.findUnique({ where: { email } });
      expect(created?.role).toBe("STUDENT");
      // Код одноразовый
      expect(await testDb().emailVerificationCode.findUnique({ where: { email } })).toBeNull();
    });

    it("на занятый адрес зарегистрироваться нельзя", async () => {
      const res = await post("/auth/register", {
        firstName: "Дубль",
        lastName: "Дублей",
        email: emailOf("student"),
        password,
        code: "111111",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("emailAlreadyExists");
    });
  });

  describe("восстановление пароля", () => {
    it("неизвестный адрес отвечает как известный, но письма не получает (аудит 2.12)", async () => {
      const unknown = await post("/auth/password/request-reset", { email: emailOf("nikogo") });
      const known = await post("/auth/password/request-reset", { email: emailOf("student") });

      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);

      expect(email.sent.some((letter) => letter.to === emailOf("nikogo"))).toBe(false);
      expect(
        email.sent.some((letter) => letter.to === emailOf("student") && letter.kind === "reset")
      ).toBe(true);
    });

    it("письмо со сбросом приходит с рабочим кодом", async () => {
      const letter = email.sent.filter((item) => item.kind === "reset").at(-1)!;
      const res = await post("/auth/password/reset", {
        email: letter.to,
        code: letter.code,
        newPassword: "eshche-odin-parol-123",
      });
      expect(res.status).toBe(201);
    });
  });

  describe("совместимость со старой сессией web", () => {
    it("кука NextAuth пока тоже пускает", async () => {
      const user = await createUser({ role: "TEACHER" });
      const legacy = await sessionCookie(user, { roleInToken: "TEACHER" });

      const res = await http().get("/api/v2/auth/me").set("Cookie", legacy);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("TEACHER");
    });
  });

  // Шаг 1 отказа от почты (PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1):
  // вход принимает логин наравне с почтой.
  describe("вход по логину", () => {
    it("логин заводит сессию так же, как почта", async () => {
      const user = await createUser({ role: "STUDENT", password });
      await testDb().user.update({ where: { id: user.id }, data: { login: `login-${user.id}` } });

      const res = await post("/auth/login", { login: `login-${user.id}`, password });
      expect(res.status).toBe(201);
      expect(res.body.user.id).toBe(user.id);
    });

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

  // Второй, независимый от почты путь сброса пароля (4.1, «Путь 2»)
  describe("сброс пароля через Telegram", () => {
    it("неизвестный логин отвечает нейтрально и не шлёт сообщение", async () => {
      const before = telegram.sent.length;
      const res = await post("/auth/password/telegram/request-code", { login: "prizrak-nikogda-ne-byl" });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
      expect(telegram.sent.length).toBe(before);
    });

    it("логин без привязанного Telegram отвечает так же нейтрально", async () => {
      const user = await createUser({ role: "STUDENT", password, login: null });
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
