import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, currentMonthKey, monthRange } from "../src/modules/billing/domain/billing";
import { ACCOUNTING_START_MONTH } from "../src/modules/finance/finance.service";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Отчёт «Финансы»: прибыль по кассе (оплаты − выплаты по датам движения
// денег) и по начислениям (начислено ученикам − начисленная зарплата), плюс
// по каждому преподавателю. Всё своё — в отдельном филиале: база общая с
// другими файлами тестов, и фильтр по филиалу отсекает их данные.
describe("модуль finance", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const current = currentMonthKey();
  const startMonth = addMonths(current, -3);
  // Середина текущего месяца по UTC — оплата и выплата точно «в этом месяце»
  const inCurrentMonth = new Date(`${current}-10T12:00:00.000Z`);

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    const student = await createUser({ role: "STUDENT" });
    ids.student = student.id;

    const branch = await createBranch(`Финансы-${run}`);
    ids.branch = branch.id;
    const otherBranch = await createBranch(`Финансы-другой-${run}`);
    ids.otherBranch = otherBranch.id;

    const course = await testDb().course.create({
      data: { slug: `finance-${run}`, title: "Курс финансов", teacherId: ids.TEACHER, price: 999_000 },
    });
    const start = new Date(`${startMonth}-01T12:00:00.000Z`);
    const group = await testDb().group.create({
      data: {
        name: `F-${run}`,
        courseId: course.id,
        branchId: branch.id,
        scheduleDays: [1, 3, 5],
        teacherId: ids.TEACHER,
        salaryPercentBp: 4000,
        price: 500_000,
        startDate: start,
      },
    });
    await testDb().enrollment.create({
      data: { studentId: student.id, courseId: course.id, groupId: group.id, startsAt: start },
    });
    await testDb().payment.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        groupId: group.id,
        branchId: branch.id,
        amount: 300_000,
        paidAt: inCurrentMonth,
        createdById: ids.ADMIN,
      },
    });
    await testDb().teacherPayout.create({
      data: { teacherId: ids.TEACHER, branchId: branch.id, amount: 100_000, paidAt: inCurrentMonth, createdById: ids.ADMIN },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, role: string) =>
    request(app.getHttpServer()).get(`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL);

  it("только администратор", async () => {
    expect((await get("/finance", "TEACHER")).status).toBe(403);
  });

  it("по кассе: принято минус выдано за месяц", async () => {
    const res = await get(`/finance?month=${current}&branchId=${ids.branch}`, "ADMIN");
    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ month: current, received: 300_000, paidOut: 100_000, cashProfit: 200_000 });
  });

  it("по начислениям: цена группы, а не курса, минус 40% зарплаты", async () => {
    const res = await get(`/finance?month=${current}&branchId=${ids.branch}`, "ADMIN");
    // Текущий месяц полный: обучение с начала трёх месяцев назад
    expect(res.body.current).toMatchObject({ charged: 500_000, salaryAccrued: 200_000, accrualProfit: 300_000 });
    // С начала учёта, но не больше 12 месяцев; новые сверху
    const windowStart = addMonths(current, -11);
    const expectedFirst = windowStart > ACCOUNTING_START_MONTH ? windowStart : ACCOUNTING_START_MONTH;
    expect(res.body.months).toHaveLength(monthRange(expectedFirst, current).length);
    expect(res.body.months[0].month).toBe(current);
    expect(res.body.months.at(-1).month).toBe(expectedFirst);
  });

  it("по каждому преподавателю: начислено и выдано за месяц", async () => {
    const res = await get(`/finance?month=${current}&branchId=${ids.branch}`, "ADMIN");
    const row = res.body.teachers.find((t: { teacherId: string }) => t.teacherId === ids.TEACHER);
    expect(row.paidOut).toBe(100_000);
    // Текущий месяц полный (обучение с начала), 40% от 500 000
    expect(row.accrued).toBe(200_000);
    expect(row.teacherName).not.toBe("");
  });

  it("фильтр по филиалу отсекает чужие деньги", async () => {
    const res = await get(`/finance?month=${current}&branchId=${ids.otherBranch}`, "ADMIN");
    expect(res.body.current).toMatchObject({ received: 0, paidOut: 0, charged: 0, salaryAccrued: 0 });
    expect(res.body.teachers).toHaveLength(0);
  });
});
