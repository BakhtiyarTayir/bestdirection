import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SessionUserCache } from "../src/common/auth/session-user.cache";
import {
  createTestApp,
  createUser,
  orphanSessionCookie,
  SESSION_COOKIE,
  sessionCookie,
  testDb,
  type TestApp,
} from "./helpers";

/**
 * Кто пришёл. Сессию держит api: строка в таблице и кука с токеном.
 * Проверки прежнего моста к куке NextAuth ушли вместе с ним (этап 9).
 */
describe("сессия в api (аудит 2.1)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const me = (cookie?: string) => {
    const req = request(app.getHttpServer()).get("/api/v2/me");
    return cookie ? req.set("Cookie", cookie) : req;
  };

  it("без куки — 401 в едином формате ошибок", async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ statusCode: 401, error: "Unauthorized", message: "unauthorized" });
  });

  it("вошедший получает себя", async () => {
    const user = await createUser({ role: "TEACHER" });
    const res = await me(await sessionCookie(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: user.id,
      role: "TEACHER",
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  });

  it("роль берётся из БД, а не из куки", async () => {
    const user = await createUser({ role: "STUDENT" });
    const cookie = await sessionCookie(user);

    await testDb().user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    app.get(SessionUserCache).forget(user.id);

    // В куке только случайный токен: права меняются вместе со строкой в БД
    expect((await me(cookie)).body.role).toBe("ADMIN");
  });

  it("деактивированный — 401", async () => {
    const user = await createUser({ role: "TEACHER", isActive: false });
    expect((await me(await sessionCookie(user))).status).toBe(401);
  });

  it("удалённый в корзину — 401", async () => {
    const user = await createUser({ role: "TEACHER", deletedAt: new Date() });
    expect((await me(await sessionCookie(user))).status).toBe(401);
  });

  it("сессия на несуществующего пользователя — 401", async () => {
    expect((await me(orphanSessionCookie())).status).toBe(401);
  });

  it("мусор вместо токена — 401", async () => {
    expect((await me(`${SESSION_COOKIE}=garbage`)).status).toBe(401);
    expect((await me("authjs.session-token=starayakuka")).status).toBe(401);
  });

  it("кука прежнего входа через NextAuth больше не принимается", async () => {
    // Мост к куке web убран вместе с NextAuth: старый вход недействителен,
    // и у того, кто не перезаходил, страница просто попросит войти
    const legacy =
      "authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..fake.payload.value";
    expect((await me(legacy)).status).toBe(401);
  });

  it("деактивация действует после сброса кэша, а до сброса — не дольше 30 секунд", async () => {
    const user = await createUser({ role: "TEACHER" });
    const cookie = await sessionCookie(user);
    expect((await me(cookie)).status).toBe(200);

    await testDb().user.update({ where: { id: user.id }, data: { isActive: false } });
    // В кэше ещё активный — это и есть окно в 30 секунд
    expect((await me(cookie)).status).toBe(200);

    app.get(SessionUserCache).forget(user.id);
    expect((await me(cookie)).status).toBe(401);
  });

  it("истёкшая сессия — 401, строка убирается", async () => {
    const user = await createUser({ role: "STUDENT" });
    const cookie = await sessionCookie(user);

    await testDb().session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await me(cookie)).status).toBe(401);
    expect(await testDb().session.count({ where: { userId: user.id } })).toBe(0);
  });
});
