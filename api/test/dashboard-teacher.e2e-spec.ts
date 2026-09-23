import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentDateKey, currentMonthKey, isoWeekday } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, testDb, type TestApp } from "./helpers";

// Панель преподавателя (план дашборда, раздел 2): «сегодня» и «текущий
// месяц» берутся той же функцией, что и сервис (currentDateKey/currentMonthKey
// из billing.ts) — тест подстраивается под реальную дату запуска, а не
// подделывает время, тем же приёмом, что finance.e2e-spec.ts.
describe("панель преподавателя", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);

  const todayKey = currentDateKey();
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const todayIso = isoWeekday(today);
  const month = currentMonthKey();
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const todayDdMm = `${todayKey.slice(8, 10)}.${todayKey.slice(5, 7)}`;

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    const foreignTeacher = await createUser({ role: "TEACHER" });
    ids.foreignTeacher = foreignTeacher.id;

    const branch = await createBranch(`Дашборд-${run}`);
    ids.branch = branch.id;

    // Мой курс: прямая группа (teacherId = я) и группа без своего педагога
    // (teacherId пусто, курс мой) — обе должны попасть в «мои группы».
    const myCourse = await testDb().course.create({
      data: { slug: `dbt-my-${run}`, title: "Мой курс", teacherId: ids.TEACHER, price: 500_000 },
    });
    ids.myCourse = myCourse.id;

    const mine1 = await testDb().group.create({
      data: {
        name: `M1-${run}`,
        courseId: myCourse.id,
        branchId: branch.id,
        teacherId: ids.TEACHER,
        scheduleDays: [todayIso],
        startDate: monthStart,
        price: 500_000,
        salaryPercentBp: 4000,
      },
    });
    ids.mine1 = mine1.id;

    const withoutOwnTeacher = await testDb().group.create({
      data: {
        name: `M2-${run}`,
        courseId: myCourse.id,
        branchId: branch.id,
        teacherId: null,
        scheduleDays: [todayIso],
        startDate: today,
      },
    });
    ids.withoutOwnTeacher = withoutOwnTeacher.id;

    // Отработка: группа без расписания (scheduleDays пуст) — любая отметка
    // в её журнале приходится на день вне расписания, независимо от того,
    // какой сегодня день недели.
    const makeupGroup = await testDb().group.create({
      data: {
        name: `M3-${run}`,
        courseId: myCourse.id,
        branchId: branch.id,
        teacherId: ids.TEACHER,
        scheduleDays: [],
      },
    });
    ids.makeupGroup = makeupGroup.id;
    await testDb().attendanceSession.create({
      data: { courseId: myCourse.id, groupId: makeupGroup.id, date: today },
    });

    // Неактивная группа — не должна появляться, даже если формально моя и
    // расписание совпадает с сегодняшним днём
    await testDb().group.create({
      data: {
        name: `M4-${run}`,
        courseId: myCourse.id,
        branchId: branch.id,
        teacherId: ids.TEACHER,
        scheduleDays: [todayIso],
        startDate: today,
        isActive: false,
      },
    });

    // Курс в Корзине — тоже не должен появляться
    const trashedCourse = await testDb().course.create({
      data: { slug: `dbt-trash-${run}`, title: "Удалённый курс", teacherId: ids.TEACHER, deletedAt: new Date() },
    });
    await testDb().group.create({
      data: {
        name: `M5-${run}`,
        courseId: trashedCourse.id,
        branchId: branch.id,
        teacherId: ids.TEACHER,
        scheduleDays: [todayIso],
        startDate: today,
      },
    });

    // Чужой курс и чужая группа — не мои, даже если педагог группы пуст
    const foreignCourse = await testDb().course.create({
      data: { slug: `dbt-foreign-${run}`, title: "Чужой курс", teacherId: ids.foreignTeacher },
    });
    ids.foreignCourse = foreignCourse.id;
    const foreignGroup = await testDb().group.create({
      data: {
        name: `F1-${run}`,
        courseId: foreignCourse.id,
        branchId: branch.id,
        teacherId: ids.foreignTeacher,
        scheduleDays: [todayIso],
        startDate: today,
      },
    });
    ids.foreignGroup = foreignGroup.id;
    const foreignWithoutTeacher = await testDb().group.create({
      data: {
        name: `F2-${run}`,
        courseId: foreignCourse.id,
        branchId: branch.id,
        teacherId: null,
        scheduleDays: [todayIso],
        startDate: today,
      },
    });
    ids.foreignWithoutTeacher = foreignWithoutTeacher.id;

    // Группа моего курса, явно отданная чужому педагогу — явный teacherId
    // важнее педагога курса
    const explicitForeignInMyCourse = await testDb().group.create({
      data: {
        name: `F3-${run}`,
        courseId: myCourse.id,
        branchId: branch.id,
        teacherId: ids.foreignTeacher,
        scheduleDays: [todayIso],
        startDate: today,
      },
    });
    ids.explicitForeignInMyCourse = explicitForeignInMyCourse.id;

    // Ученик, оплативший группу mine1 целиком с начала месяца — база для
    // сверки зарплаты с /salary/me
    await testDb().enrollment.create({
      data: { studentId: ids.STUDENT, courseId: myCourse.id, groupId: mine1.id, startsAt: monthStart },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, role: string) =>
    request(app.getHttpServer()).get(`/api/v2${path}`).set("Cookie", cookies[role]);

  it("без входа — 401, администратору — 403", async () => {
    expect((await request(app.getHttpServer()).get("/api/v2/dashboard/teacher")).status).toBe(401);
    expect((await get("/dashboard/teacher", "ADMIN")).status).toBe(403);
  });

  it("сегодня: свои группы видны, чужие и неактивные — нет", async () => {
    const res = await get("/dashboard/teacher", "TEACHER");
    expect(res.status).toBe(200);
    const todayLessons: { groupId: string; marked: boolean | null; isMakeup: boolean }[] =
      res.body.schedule.days.find((d: { date: string }) => d.date === todayKey)?.lessons ?? [];
    const groupIds = todayLessons.map((l) => l.groupId);

    expect(groupIds).toContain(ids.mine1);
    expect(groupIds).toContain(ids.withoutOwnTeacher);
    expect(groupIds).not.toContain(ids.foreignGroup);
    expect(groupIds).not.toContain(ids.foreignWithoutTeacher);
    expect(groupIds).not.toContain(ids.explicitForeignInMyCourse);
    // Неактивная и группа курса в Корзине созданы с тем же именем-паттерном M4/M5 —
    // достаточно убедиться, что общее число моих сегодняшних занятий не раздулось
    // сверх ожидаемого (mine1, withoutOwnTeacher, makeupGroup)
    expect(groupIds).toHaveLength(3);

    const mine1Lesson = todayLessons.find((l) => l.groupId === ids.mine1);
    expect(mine1Lesson).toMatchObject({ marked: false, isMakeup: false });

    const makeupLesson = todayLessons.find((l) => l.groupId === ids.makeupGroup);
    expect(makeupLesson).toMatchObject({ marked: true, isMakeup: true });

    expect(res.body.today).toMatchObject({ date: todayKey, totalCount: 3, markedCount: 1 });
  });

  it("неотмеченный сегодняшний день числится в списке за месяц", async () => {
    const res = await get("/dashboard/teacher", "TEACHER");
    const mine1Entry = res.body.unmarkedThisMonth.find((g: { groupId: string }) => g.groupId === ids.mine1);
    expect(mine1Entry).toBeTruthy();
    expect(mine1Entry.dates).toContain(todayDdMm);
  });

  it("после отметки сегодня — «отмечено», и день уходит из списка неотмеченных", async () => {
    await testDb().attendanceSession.create({
      data: { courseId: ids.myCourse, groupId: ids.mine1, date: today },
    });

    const res = await get("/dashboard/teacher", "TEACHER");
    const todayLessons: { groupId: string; marked: boolean | null }[] = res.body.schedule.days.find(
      (d: { date: string }) => d.date === todayKey
    ).lessons;
    expect(todayLessons.find((l) => l.groupId === ids.mine1)).toMatchObject({ marked: true });

    const mine1Entry = res.body.unmarkedThisMonth.find((g: { groupId: string }) => g.groupId === ids.mine1);
    expect(mine1Entry?.dates ?? []).not.toContain(todayDdMm);
  });

  it("зарплата за месяц совпадает с /salary/me", async () => {
    const dashboard = await get("/dashboard/teacher", "TEACHER");
    const salaryMe = await get("/salary/me", "TEACHER");
    expect(salaryMe.status).toBe(200);

    expect(dashboard.body.salary.month).toBe(month);
    expect(dashboard.body.salary.paidTotal).toBe(salaryMe.body.paidTotal);
    expect(dashboard.body.salary.debt).toBe(salaryMe.body.debt);

    const myGroup = salaryMe.body.groups.find((g: { groupId: string }) => g.groupId === ids.mine1);
    const currentMonthRow = myGroup?.months.find((m: { month: string }) => m.month === month);
    expect(dashboard.body.salary.accruedThisMonth).toBe(currentMonthRow?.amount ?? 0);
    // Группа полностью оплачена с начала месяца по её цене — начисление есть
    expect(dashboard.body.salary.accruedThisMonth).toBeGreaterThan(0);
  });

  it("нынешние счётчики курсов и учеников на месте", async () => {
    const res = await get("/dashboard/teacher", "TEACHER");
    expect(res.body.courses).toBeGreaterThanOrEqual(1);
    expect(res.body.students).toBeGreaterThanOrEqual(1);
  });
});
