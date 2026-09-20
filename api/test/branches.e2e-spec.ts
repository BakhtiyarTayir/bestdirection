import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("модуль branches", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);

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

  describe("справочник читает персонал и ученики", () => {
    it("аноним — 401", async () => {
      expect((await get("/branches")).status).toBe(401);
    });

    it.each(["ADMIN", "TEACHER", "STUDENT"])("%s видит справочник", async (role) => {
      expect((await get("/branches", role)).status).toBe(200);
    });

    // Права на Branch пока даны только ADMIN/TEACHER/STUDENT (решение
    // владельца: пока справочник + поле, без роли «администратор филиала»).
    // PARENT названия филиала нигде не показывают — расширить, если понадобится.
    it("PARENT пока не читает справочник", async () => {
      expect((await get("/branches", "PARENT")).status).toBe(403);
    });
  });

  describe("создание, изменение и удаление — только ADMIN", () => {
    it.each(["TEACHER", "STUDENT", "PARENT"])("%s не создаёт филиал", async (role) => {
      const res = await send("post", "/branches", role, { name: `X-${run}` });
      expect(res.status).toBe(403);
    });

    it("ADMIN создаёт филиал", async () => {
      const res = await send("post", "/branches", "ADMIN", { name: `Чиланзар-${run}`, address: "ул. Мира, 1" });
      expect(res.status).toBe(201);
      expect(res.body.isActive).toBe(true);
      ids.branch = res.body.id;
    });

    it("имя филиала уникально", async () => {
      const res = await send("post", "/branches", "ADMIN", { name: `Чиланзар-${run}` });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("branchNameExists");
    });

    it.each(["TEACHER", "STUDENT"])("%s не редактирует и не удаляет филиал", async (role) => {
      expect((await send("patch", `/branches/${ids.branch}`, role, { address: "взлом" })).status).toBe(403);
      expect((await send("delete", `/branches/${ids.branch}`, role)).status).toBe(403);
    });

    it("ADMIN переименовывает и выключает филиал", async () => {
      const res = await send("patch", `/branches/${ids.branch}`, "ADMIN", {
        name: `Юнусабад-${run}`,
        isActive: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(`Юнусабад-${run}`);
      expect(res.body.isActive).toBe(false);
    });

    it("несуществующий филиал — 404", async () => {
      expect((await send("patch", "/branches/no-such-branch", "ADMIN", { name: "X" })).status).toBe(404);
      expect((await send("delete", "/branches/no-such-branch", "ADMIN")).status).toBe(404);
    });
  });

  describe("удаление филиала с группами", () => {
    it("филиал с группами не удаляется — понятная ошибка, а не 500", async () => {
      const course = await testDb().course.create({
        data: { slug: `branch-del-${run}`, title: "Курс", teacherId: ids.TEACHER },
      });
      const branch = await testDb().branch.create({ data: { name: `С группой-${run}` } });
      await testDb().group.create({ data: { name: `G-${run}`, courseId: course.id, branchId: branch.id } });

      const res = await send("delete", `/branches/${branch.id}`, "ADMIN");
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("branchHasGroups");
    });

    it("пустой филиал удаляется", async () => {
      const branch = await testDb().branch.create({ data: { name: `Пустой-${run}` } });
      const res = await send("delete", `/branches/${branch.id}`, "ADMIN");
      expect(res.status).toBe(200);
      expect(await testDb().branch.findUnique({ where: { id: branch.id } })).toBeNull();
    });
  });
});
