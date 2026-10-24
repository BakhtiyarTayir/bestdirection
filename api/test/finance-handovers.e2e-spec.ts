import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Журнал сдачи прибыли владельцу: сдача уменьшает «осталось на руках»
// (onHand) месяца forMonth в отчёте «Финансы». Всё своё — в отдельных
// филиалах, фильтр по филиалу отсекает данные других файлов тестов.
describe("finance: сдача прибыли", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const current = currentMonthKey();

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    const student = await createUser({ role: "STUDENT" });
    const branch = await createBranch(`Сдача-${run}`);
    const other = await createBranch(`Сдача-другой-${run}`);
    ids.branch = branch.id;
    ids.other = other.id;
    // Кассовая прибыль 200 000 в первом филиале: оплата 300 000, выплата 100 000
    const course = await testDb().course.create({
      data: { slug: `handover-${run}`, title: "Курс сдачи", teacherId: ids.TEACHER, price: 1 },
    });
    const at = new Date(`${current}-10T12:00:00.000Z`);
    await testDb().payment.create({
      data: { studentId: student.id, courseId: course.id, branchId: branch.id, amount: 300_000, paidAt: at, createdById: ids.ADMIN },
    });
    await testDb().teacherPayout.create({
      data: { teacherId: ids.TEACHER, branchId: branch.id, amount: 100_000, paidAt: at, createdById: ids.ADMIN },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const call = (method: "get" | "post" | "delete", path: string, role: string) =>
    request(app.getHttpServer())[method](`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL);

  const onHand = async (branchId: string) => {
    const res = await call("get", `/finance?month=${current}&branchId=${branchId}`, "ADMIN");
    return res.body.current as { cashProfit: number; handedOver: number; onHand: number };
  };

  const body = (extra: object = {}) => ({
    branchId: ids.branch,
    amount: 50_000,
    handedAt: `${current}-12`,
    forMonth: current,
    receivedBy: "Владелец",
    ...extra,
  });

  it("без сдач onHand равен кассовой прибыли", async () => {
    expect(await onHand(ids.branch)).toMatchObject({ cashProfit: 200_000, handedOver: 0, onHand: 200_000 });
  });

  it("сдача появляется в списке и уменьшает onHand ровно на сумму; другой филиал не затронут", async () => {
    const created = await call("post", "/finance/handovers", "ADMIN").send(body());
    expect(created.status).toBe(201);

    const list = await call("get", `/finance/handovers?month=${current}&branchId=${ids.branch}`, "ADMIN");
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.total).toBe(50_000);
    expect(list.body.handovers[0]).toMatchObject({
      id: created.body.id,
      amount: 50_000,
      receivedBy: "Владелец",
      branch: { id: ids.branch },
    });
    expect(list.body.handovers[0].createdBy.firstName).toBeDefined();
    expect(list.body.handovers[0].handedAt.slice(0, 10)).toBe(`${current}-12`);

    expect(await onHand(ids.branch)).toMatchObject({ handedOver: 50_000, onHand: 150_000 });
    expect(await onHand(ids.other)).toMatchObject({ handedOver: 0, onHand: 0 });

    // Сдача другого филиала не меняет этот
    expect((await call("post", "/finance/handovers", "ADMIN").send(body({ branchId: ids.other, amount: 7_000 }))).status).toBe(201);
    expect(await onHand(ids.branch)).toMatchObject({ handedOver: 50_000, onHand: 150_000 });
    expect(await onHand(ids.other)).toMatchObject({ handedOver: 7_000, onHand: -7_000 });
  });

  it("запись попадает в аудит", async () => {
    const created = await call("post", "/finance/handovers", "ADMIN").send(body({ amount: 1_000 }));
    const audit = await testDb().auditLog.findFirst({ where: { entityType: "ProfitHandover", entityId: created.body.id } });
    expect(audit?.action).toBe("CREATE");
  });

  it("без филиала, с нулевой суммой и кривым месяцем — 400", async () => {
    const { branchId: _omit, ...withoutBranch } = body();
    void _omit;
    expect((await call("post", "/finance/handovers", "ADMIN").send(withoutBranch)).status).toBe(400);
    expect((await call("post", "/finance/handovers", "ADMIN").send(body({ amount: 0 }))).status).toBe(400);
    expect((await call("post", "/finance/handovers", "ADMIN").send(body({ forMonth: "2026-13" }))).status).toBe(400);
  });

  it("несуществующий филиал — 404", async () => {
    expect((await call("post", "/finance/handovers", "ADMIN").send(body({ branchId: "nope" }))).status).toBe(404);
  });

  it("удаление мягкое: onHand возвращается, из списка пропадает, повторное — 404", async () => {
    const branch = await createBranch(`Сдача-удаление-${run}`);
    const created = await call("post", "/finance/handovers", "ADMIN").send(body({ branchId: branch.id, amount: 20_000 }));
    expect((await onHand(branch.id)).onHand).toBe(-20_000);

    expect((await call("delete", `/finance/handovers/${created.body.id}`, "ADMIN")).status).toBe(200);
    expect((await onHand(branch.id)).onHand).toBe(0);
    const list = await call("get", `/finance/handovers?month=${current}&branchId=${branch.id}`, "ADMIN");
    expect(list.body.count).toBe(0);
    const row = await testDb().profitHandover.findUnique({ where: { id: created.body.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect((await call("delete", `/finance/handovers/${created.body.id}`, "ADMIN")).status).toBe(404);
  });

  it("не администратор — 403 на все три маршрута", async () => {
    expect((await call("get", "/finance/handovers", "TEACHER")).status).toBe(403);
    expect((await call("post", "/finance/handovers", "TEACHER").send(body())).status).toBe(403);
    expect((await call("delete", "/finance/handovers/x", "TEACHER")).status).toBe(403);
  });
});
