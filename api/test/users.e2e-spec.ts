import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  createUser,
  sessionCookie,
  TEST_APP_URL,
  testDb,
  type TestApp,
} from "./helpers";

describe("модуль users", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user, { roleInToken: role });
    }
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const get = (path: string, role?: string) => {
    const req = http().get(`/api/v2${path}`);
    return role ? req.set("Cookie", cookies[role]) : req;
  };
  const send = (method: "post" | "patch" | "delete", path: string, role: string, body?: object) =>
    http()[method](`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL).send(body);

  describe("матрица ролей", () => {
    const matrix: Array<[string, string, string, number]> = [
      ["GET", "/users", "ADMIN", 200],
      ["GET", "/users", "TEACHER", 200],
      ["GET", "/users", "STUDENT", 403],
      ["GET", "/users", "PARENT", 403],
      ["GET", "/users/teachers", "ADMIN", 200],
      ["GET", "/users/teachers", "TEACHER", 403],
      ["GET", "/users/deactivated", "ADMIN", 200],
      ["GET", "/users/deactivated", "TEACHER", 403],
      ["GET", "/users/statistics/homework", "ADMIN", 200],
      ["GET", "/users/statistics/homework", "TEACHER", 200],
      ["GET", "/users/statistics/homework", "STUDENT", 403],
      ["GET", "/audit-log", "ADMIN", 200],
      ["GET", "/audit-log", "TEACHER", 403],
    ];

    it.each(matrix)("%s %s под ролью %s → %i", async (_method, path, role, expected) => {
      expect((await get(path, role)).status).toBe(expected);
    });

    it("аноним не проходит дальше 401", async () => {
      expect((await get("/users")).status).toBe(401);
    });

    it("преподаватель видит только учеников и себя", async () => {
      const res = await get("/users", "TEACHER");
      const roles = new Set(res.body.map((u: { role: string }) => u.role));
      expect([...roles].sort()).toEqual(["STUDENT", "TEACHER"]);
      expect(res.body.filter((u: { role: string }) => u.role === "TEACHER")).toEqual([
        expect.objectContaining({ id: ids.TEACHER }),
      ]);
    });

    it("администратор видит все роли", async () => {
      const res = await get("/users", "ADMIN");
      const roles = new Set(res.body.map((u: { role: string }) => u.role));
      expect(roles).toContain("PARENT");
      expect(roles).toContain("ADMIN");
    });

    it.each(["TEACHER", "STUDENT", "PARENT"])("%s не может создать пользователя", async (role) => {
      const res = await send("post", "/users", role, {
        password: "12345678",
        firstName: "X",
        lastName: "Y",
        role: "STUDENT",
      });
      expect(res.status).toBe(403);
    });

    it.each(["TEACHER", "STUDENT"])("%s не может менять и удалять чужого", async (role) => {
      expect((await send("patch", `/users/${ids.STUDENT}`, role, { firstName: "Z" })).status).toBe(403);
      expect((await send("delete", `/users/${ids.STUDENT}`, role)).status).toBe(403);
    });
  });

  describe("чужой id — 404, а не 403", () => {
    it("ученик читает себя, но не другого", async () => {
      expect((await get(`/users/${ids.STUDENT}`, "STUDENT")).status).toBe(200);
      const res = await get(`/users/${ids.TEACHER}`, "STUDENT");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("userNotFound");
    });

    it("родитель не читает чужого", async () => {
      expect((await get(`/users/${ids.STUDENT}`, "PARENT")).status).toBe(404);
    });

    it("преподаватель читает ученика, но не другого преподавателя", async () => {
      const otherTeacher = await createUser({ role: "TEACHER" });
      expect((await get(`/users/${ids.STUDENT}`, "TEACHER")).status).toBe(200);
      expect((await get(`/users/${otherTeacher.id}`, "TEACHER")).status).toBe(404);
    });

    it("несуществующий id — 404", async () => {
      expect((await get("/users/no-such-id", "ADMIN")).status).toBe(404);
    });
  });

  describe("создание и изменение (аудит 1.3 — схемы выполняются на сервере)", () => {
    it("короткий пароль не проходит", async () => {
      const res = await send("post", "/users", "ADMIN", {
        password: "short",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("validationFailed");
      expect(res.body.details[0].path).toEqual(["password"]);
    });

    it("роль вне списка не проходит", async () => {
      const res = await send("post", "/users", "ADMIN", {
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "SUPERUSER",
      });
      expect(res.status).toBe(400);
    });

    it("лишние поля отбрасываются, пользователь создаётся", async () => {
      const res = await send("post", "/users", "ADMIN", {
        email: "new-user@test.uz",
        password: "12345678",
        firstName: "Имя",
        lastName: "Фамилия",
        role: "STUDENT",
        isActive: false,
        number: 99999,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email: "new-user@test.uz", role: "STUDENT", isActive: true });
      expect(res.body.number).not.toBe(99999);
    });

    it("занятая почта — 409 emailExists", async () => {
      const res = await send("post", "/users", "ADMIN", {
        email: "new-user@test.uz",
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("emailExists");
    });

    it("почта удалённого пользователя остаётся занятой", async () => {
      const deleted = await createUser({ role: "STUDENT", deletedAt: new Date() });
      const res = await send("post", "/users", "ADMIN", {
        email: deleted.email!,
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
      });
      expect(res.body.message).toBe("emailExists");
    });

    it("изменение пишется в журнал аудита", async () => {
      const target = await createUser({ role: "STUDENT" });
      const res = await send("patch", `/users/${target.id}`, "ADMIN", { firstName: "Новое" });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe("Новое");

      const log = await testDb().auditLog.findFirst({
        where: { entityType: "User", entityId: target.id, action: "UPDATE" },
      });
      expect(log?.changes).toMatchObject({ firstName: { new: "Новое" } });
    });
  });

  describe("деактивация и удаление", () => {
    it("нельзя выключить или стереть себя", async () => {
      expect((await send("post", `/users/${ids.ADMIN}/deactivate`, "ADMIN")).body.message).toBe(
        "cannotDeactivateSelf"
      );
      expect((await send("delete", `/users/${ids.ADMIN}`, "ADMIN")).body.message).toBe("cannotPurgeSelf");
    });

    it("активного нельзя стереть, деактивированного — можно", async () => {
      const target = await createUser({ role: "STUDENT" });
      expect((await send("delete", `/users/${target.id}`, "ADMIN")).body.message).toBe("userIsActive");

      expect((await send("post", `/users/${target.id}/deactivate`, "ADMIN")).status).toBe(201);
      expect((await send("delete", `/users/${target.id}`, "ADMIN")).status).toBe(200);
      expect(await testDb().user.findUnique({ where: { id: target.id } })).toBeNull();
    });

    it("восстановление возвращает в строй и снимает deletedAt", async () => {
      const target = await createUser({ role: "STUDENT", isActive: false, deletedAt: new Date() });
      expect((await send("post", `/users/${target.id}/restore`, "ADMIN")).status).toBe(201);
      const row = await testDb().user.findUnique({ where: { id: target.id } });
      expect(row).toMatchObject({ isActive: true, deletedAt: null });
    });
  });

  describe("регрессия аудита 2.1: деактивация действует сразу", () => {
    it("выключенный пользователь получает 401 следующим же запросом", async () => {
      const victim = await createUser({ role: "TEACHER" });
      const victimCookie = await sessionCookie(victim);
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).status).toBe(200);

      await send("post", `/users/${victim.id}/deactivate`, "ADMIN");

      // Без сброса кэша сессий он ходил бы ещё 30 секунд, а в web с JWT — 30 дней
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).status).toBe(401);
    });

    it("смена роли действует сразу", async () => {
      const victim = await createUser({ role: "TEACHER" });
      const victimCookie = await sessionCookie(victim, { roleInToken: "TEACHER" });
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).body.role).toBe("TEACHER");

      await send("patch", `/users/${victim.id}`, "ADMIN", { role: "STUDENT" });
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).body.role).toBe("STUDENT");
    });
  });

  describe("регрессия аудита 3.7: последний администратор", () => {
    it("не может разжаловать сам себя, пока других активных нет", async () => {
      // Других администраторов в общей тестовой базе временно выключаем
      await testDb().user.updateMany({
        where: { role: "ADMIN", id: { not: ids.ADMIN } },
        data: { isActive: false },
      });

      const res = await send("patch", `/users/${ids.ADMIN}`, "ADMIN", { role: "TEACHER" });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("lastAdmin");

      const second = await createUser({ role: "ADMIN" });
      const allowed = await send("patch", `/users/${ids.ADMIN}`, "ADMIN", { role: "ADMIN" });
      expect(allowed.status).toBe(200);
      await testDb().user.delete({ where: { id: second.id } });
    });
  });

  describe("регрессия аудита 2.8: привязка Telegram", () => {
    it("новый код не трогает существующую привязку", async () => {
      const linked = await createUser({ role: "STUDENT", telegramChatId: "555000" });
      const cookie = await sessionCookie(linked);

      const first = await http()
        .post("/api/v2/me/telegram/code")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL);
      expect(first.status).toBe(201);
      expect(first.body.code).toMatch(/^[0-9a-f]{32}$/);

      const second = await http()
        .post("/api/v2/me/telegram/code")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL);
      expect(second.body.code).not.toBe(first.body.code);

      // Главное: chat id на месте, вход через Telegram не потерян
      const row = await testDb().user.findUnique({ where: { id: linked.id } });
      expect(row?.telegramChatId).toBe("555000");

      // Старый код больше не действует
      const codes = await testDb().telegramLinkRequest.findMany({ where: { userId: linked.id } });
      expect(codes.map((c) => c.code)).toEqual([second.body.code]);
      expect(codes[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

      const status = await http().get("/api/v2/me/telegram").set("Cookie", cookie);
      expect(status.body).toEqual({ isLinked: true, username: null });
    });

    it("отвязка убирает chat id и коды", async () => {
      const linked = await createUser({ role: "STUDENT", telegramChatId: "555111" });
      const cookie = await sessionCookie(linked);
      await http().post("/api/v2/me/telegram/code").set("Cookie", cookie).set("Origin", TEST_APP_URL);

      const res = await http()
        .delete("/api/v2/me/telegram")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL);
      expect(res.status).toBe(200);

      const row = await testDb().user.findUnique({ where: { id: linked.id } });
      expect(row?.telegramChatId).toBeNull();
      expect(await testDb().telegramLinkRequest.count({ where: { userId: linked.id } })).toBe(0);
    });
  });

  describe("свой профиль и пароль", () => {
    it("профиль меняет только сам пользователь", async () => {
      const res = await send("patch", "/me/profile", "STUDENT", { firstName: "Новое", lastName: "Имя" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: ids.STUDENT, firstName: "Новое" });
    });

    it("неверный текущий пароль не принимается", async () => {
      const user = await createUser({ role: "STUDENT", password: "oldpassword" });
      const cookie = await sessionCookie(user);
      const wrong = await http()
        .post("/api/v2/me/password")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL)
        .send({ currentPassword: "nope-nope", newPassword: "newpassword" });
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toBe("currentPasswordIncorrect");

      const ok = await http()
        .post("/api/v2/me/password")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL)
        .send({ currentPassword: "oldpassword", newPassword: "newpassword" });
      expect(ok.status).toBe(201);
    });

    it("короткий новый пароль не проходит", async () => {
      const res = await send("post", "/me/password", "STUDENT", {
        currentPassword: "whatever",
        newPassword: "short",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("validationFailed");
    });
  });
});
