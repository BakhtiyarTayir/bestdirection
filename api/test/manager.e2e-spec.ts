import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("роль MANAGER", () => {
  let app: TestApp;
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "MANAGER", "TEACHER", "STUDENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    const other = await createUser({ role: "MANAGER" });
    ids.otherManager = other.id;
    await testDb().user.update({ where: { id: ids.TEACHER }, data: { salaryPercentBp: 4200 } });
    const branch = await createBranch("Менеджер");
    ids.branch = branch.id;
    const course = await testDb().course.create({
      data: { slug: `manager-${Date.now()}`, title: "Курс менеджера", teacherId: ids.TEACHER },
    });
    ids.course = course.id;
    const group = await testDb().group.create({
      data: { name: "Группа менеджера", courseId: course.id, branchId: branch.id, salaryPercentBp: 4000 },
    });
    ids.group = group.id;
  });
  afterAll(async () => { if (app) await app.close(); });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v2${path}`).set("Cookie", cookies.MANAGER);
  const send = (method: "post" | "patch" | "delete", path: string, body?: object) =>
    request(app.getHttpServer())[method](`/api/v2${path}`)
      .set("Cookie", cookies.MANAGER).set("Origin", TEST_APP_URL).send(body);

  it("не создаёт и не назначает руководящие роли", async () => {
    for (const role of ["ADMIN", "MANAGER"]) {
      const created = await send("post", "/users", {
        login: `mgr-${role.toLowerCase()}-${Date.now()}`,
        password: "password123",
        firstName: "Новый",
        lastName: "Сотрудник",
        branchId: ids.branch,
        role,
      });
      expect(created.status).toBe(403);
      expect((await send("patch", `/users/${ids.STUDENT}`, { role })).status).toBe(403);
    }
  });

  it("не правит, не отключает и не приглашает ADMIN и MANAGER", async () => {
    for (const id of [ids.ADMIN, ids.otherManager]) {
      expect((await send("patch", `/users/${id}`, { firstName: "Чужой" })).status).toBe(403);
      expect((await send("post", `/users/${id}/deactivate`)).status).toBe(403);
      expect((await send("post", `/users/${id}/telegram-invite`)).status).toBe(403);
    }
  });

  it("не видит и не меняет ставки", async () => {
    expect((await get(`/users/${ids.TEACHER}`)).body.salaryPercentBp).toBeNull();
    expect((await get(`/groups/${ids.group}`)).body.salaryPercentBp).toBeNull();
    const groups = await get(`/groups/by-course?courseId=${ids.course}`);
    expect(groups.body[0].salaryPercentBp).toBeNull();
    expect((await send("patch", `/users/${ids.TEACHER}`, { salaryPercentBp: 5000 })).status).toBe(403);
    expect((await send("patch", `/groups/${ids.group}`, { salaryPercentBp: 5000 })).status).toBe(403);
  });

  it("получает 403 на финансы, зарплату, возвраты и удаление оплаты", async () => {
    for (const path of ["/finance", "/finance/handovers", "/salary", "/salary/me", "/billing/refunds"]) {
      expect((await get(path)).status, path).toBe(403);
    }
    expect((await send("post", "/billing/refunds", {})).status).toBe(403);
    expect((await send("delete", "/billing/payments/test-id")).status).toBe(403);
  });

  it("видит админскую главную только с долгом учеников", async () => {
    expect((await get("/dashboard/summary")).body.role).toBe("MANAGER");
    const response = await get("/dashboard/admin");
    expect(response.status).toBe(200);
    expect(response.body.money).toEqual({ debtTotal: expect.any(Number), debtorsCount: expect.any(Number) });
    expect(response.body.attention.groupsWithoutRate).toBe(0);
  });
});
