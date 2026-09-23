import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toNoonUtc } from "../src/common/date-only";
import { currentDateKey, currentMonthKey, isoWeekday } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Главная панель администратора (план дашборда, 1.1–1.3): деньги за месяц
// сверяются с /finance и /billing/debtors, «сегодня» — с журналом
// посещаемости, «требует внимания» — с сырыми счётчиками. Всё своё — в
// отдельном филиале, как в finance.e2e-spec.ts.
describe("модуль dashboard/admin", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const current = currentMonthKey();
  // Та же функция, что использует сервис, — тест не должен разъехаться с
  // ним в окне 19:00–24:00 UTC, когда в Ташкенте уже другой день
  const todayKey = currentDateKey();
  const todayDate = toNoonUtc(todayKey);
  const todayWeekday = isoWeekday(todayDate);

  const get = (path: string, role: string) =>
    request(app.getHttpServer()).get(`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL);

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    const student = await createUser({ role: "STUDENT" });
    ids.student = student.id;

    const branch = await createBranch(`Дашборд-${run}`);
    ids.branch = branch.id;

    const course = await testDb().course.create({
      data: { slug: `dash-admin-${run}`, title: "Курс дашборда", teacherId: ids.TEACHER, price: 999_000 },
    });
    ids.course = course.id;

    // Группа сегодняшнего дня недели — со своей ставкой, чтобы не попасть в
    // «без ставки», и с оплатой, чтобы деньги можно было сверить
    const start = new Date(`${current}-01T12:00:00.000Z`);
    const group = await testDb().group.create({
      data: {
        name: `G-${run}`,
        courseId: course.id,
        branchId: branch.id,
        scheduleDays: [todayWeekday],
        teacherId: ids.TEACHER,
        salaryPercentBp: 4000,
        price: 500_000,
        startDate: start,
      },
    });
    ids.group = group.id;

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
        paidAt: todayDate,
        createdById: ids.ADMIN,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("только администратор", async () => {
    expect((await get(`/dashboard/admin?branchId=${ids.branch}`, "TEACHER")).status).toBe(403);
  });

  it("деньги совпадают с /finance и /billing/debtors для своего филиала", async () => {
    const [dashboard, finance, debtors, salary] = await Promise.all([
      get(`/dashboard/admin?branchId=${ids.branch}`, "ADMIN"),
      get(`/finance?branchId=${ids.branch}`, "ADMIN"),
      get(`/billing/debtors?branchId=${ids.branch}`, "ADMIN"),
      get(`/salary?branchId=${ids.branch}`, "ADMIN"),
    ]);

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.month).toBe(finance.body.month);
    expect(dashboard.body.money.received).toBe(finance.body.current.received);
    expect(dashboard.body.money.cashProfit).toBe(finance.body.current.cashProfit);
    expect(dashboard.body.money.debtTotal).toBe(debtors.body.totalDebt);
    expect(dashboard.body.money.debtorsCount).toBe(debtors.body.debtors.length);
    expect(dashboard.body.money.teacherDebt).toBe(salary.body.totals.debt);
  });

  it("«сегодня»: группа без занятия — не отмечено, после создания сессии — отмечено", async () => {
    const before = await get(`/dashboard/admin?branchId=${ids.branch}`, "ADMIN");
    const lessonBefore = before.body.today.lessons.find((l: { groupId: string }) => l.groupId === ids.group);
    expect(lessonBefore).toMatchObject({ groupId: ids.group, marked: false });
    expect(before.body.today.markedCount).toBe(0);
    expect(before.body.today.totalCount).toBeGreaterThanOrEqual(1);

    await testDb().attendanceSession.create({
      data: { courseId: ids.course, groupId: ids.group, date: todayDate },
    });

    const after = await get(`/dashboard/admin?branchId=${ids.branch}`, "ADMIN");
    const lessonAfter = after.body.today.lessons.find((l: { groupId: string }) => l.groupId === ids.group);
    expect(lessonAfter).toMatchObject({ groupId: ids.group, marked: true });
    expect(after.body.today.markedCount).toBe(1);
  });

  it("«требует внимания»: ученик без группы и группа без ставки считаются", async () => {
    const before = (await get(`/dashboard/admin?branchId=${ids.branch}`, "ADMIN")).body.attention;

    const looseStudent = await createUser({ role: "STUDENT" });
    await testDb().enrollment.create({
      data: { studentId: looseStudent.id, courseId: ids.course, groupId: null },
    });

    // Без своей ставки и без ставки ведущего (у TEACHER личной ставки нет) —
    // должна попасть в «без ставки»
    await testDb().group.create({
      data: {
        name: `Без ставки-${run}`,
        courseId: ids.course,
        branchId: ids.branch,
        scheduleDays: [],
        teacherId: ids.TEACHER,
        salaryPercentBp: null,
      },
    });

    const after = (await get(`/dashboard/admin?branchId=${ids.branch}`, "ADMIN")).body.attention;
    expect(after.studentsWithoutGroup).toBeGreaterThanOrEqual(before.studentsWithoutGroup + 1);
    expect(after.groupsWithoutRate).toBe(before.groupsWithoutRate + 1);
  });
});
