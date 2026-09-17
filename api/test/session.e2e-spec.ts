import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SessionUserCache } from "../src/common/auth/session-user.cache";
import {
  createTestApp,
  createUser,
  SECURE_SESSION_COOKIE,
  sessionCookie,
  testDb,
  type TestApp,
} from "./helpers";

describe("сессия web в api (аудит 2.1)", () => {
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
    const res = await me(await sessionCookie(user, { roleInToken: "TEACHER" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: user.id,
      role: "TEACHER",
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  });

  it("роль берётся из БД, а не из токена", async () => {
    const user = await createUser({ role: "STUDENT" });
    const res = await me(await sessionCookie(user, { roleInToken: "ADMIN" }));
    expect(res.body.role).toBe("STUDENT");
  });

  it("кука по HTTPS (__Secure-) тоже читается", async () => {
    const user = await createUser({ role: "PARENT" });
    const res = await me(await sessionCookie(user, { cookieName: SECURE_SESSION_COOKIE }));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("PARENT");
  });

  it("кука, разрезанная Auth.js на части, собирается", async () => {
    const user = await createUser({ role: "STUDENT" });
    const [name, token] = (await sessionCookie(user)).split("=");
    const half = Math.ceil(token.length / 2);
    const res = await me(`${name}.0=${token.slice(0, half)}; ${name}.1=${token.slice(half)}`);
    expect(res.status).toBe(200);
  });

  it("деактивированный — 401", async () => {
    const user = await createUser({ role: "TEACHER", isActive: false });
    expect((await me(await sessionCookie(user))).status).toBe(401);
  });

  it("удалённый в корзину — 401", async () => {
    const user = await createUser({ role: "TEACHER", deletedAt: new Date() });
    expect((await me(await sessionCookie(user))).status).toBe(401);
  });

  it("несуществующий пользователь — 401", async () => {
    const res = await me(await sessionCookie({ id: "no-such-user", email: null }));
    expect(res.status).toBe(401);
  });

  it("чужой секрет, мусор и просроченный токен — 401", async () => {
    const user = await createUser({ role: "ADMIN" });
    const foreign = await sessionCookie(user, { secret: "another-secret-0123456789abcdef" });
    const expired = await sessionCookie(user, { maxAge: -60 });
    expect((await me(foreign)).status).toBe(401);
    expect((await me("authjs.session-token=garbage")).status).toBe(401);
    expect((await me(expired)).status).toBe(401);
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

  it("смена роли действует после сброса кэша", async () => {
    const user = await createUser({ role: "ADMIN" });
    const cookie = await sessionCookie(user, { roleInToken: "ADMIN" });
    expect((await me(cookie)).body.role).toBe("ADMIN");

    await testDb().user.update({ where: { id: user.id }, data: { role: "TEACHER" } });
    app.get(SessionUserCache).forget(user.id);
    expect((await me(cookie)).body.role).toBe("TEACHER");
  });

  it("health открыт без входа", async () => {
    const res = await request(app.getHttpServer()).get("/api/v2/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
