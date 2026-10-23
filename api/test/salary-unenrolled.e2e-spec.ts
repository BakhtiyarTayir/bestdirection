import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Отчисление и зарплата: начисление ученика за текущий (открытый) месяц до
// даты отчисления должно остаться в базе зарплаты — в группе, из которой его
// отчислили, или в «курсе без группы», если группы у него не было.
describe("зарплата и отчисленные", () => {
  let app: TestApp;
  let adminCookie: string;
  let teacherId: string;
  let branchId: string;
  const run = Date.now().toString(36);
  const current = currentMonthKey();
  const startMonth = addMonths(current, -2);
  const start = new Date(`${startMonth}-01T12:00:00.000Z`);

  beforeAll(async () => {
    app = await createTestApp();
    adminCookie = await sessionCookie(await createUser({ role: "ADMIN" }));
    teacherId = (await createUser({ role: "TEACHER" })).id;
    branchId = (await createBranch("Отчисленные")).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const get = (path: string) => http().get(`/api/v2${path}`).set("Cookie", adminCookie);
  const send = (method: "post" | "delete", path: string, body?: object) =>
    http()[method](`/api/v2${path}`).set("Cookie", adminCookie).set("Origin", TEST_APP_URL).send(body);

  async function course(suffix: string) {
    return testDb().course.create({
      data: { slug: `unenr-${suffix}-${run}`, title: `Отчисление ${suffix}`, teacherId, price: 300_000 },
    });
  }

  it("начисление отчисленного входит в base и studentsCount группы", async () => {
    const c = await course("group2");
    const group = await testDb().group.create({
      data: { name: `G2-${run}`, courseId: c.id, branchId, price: 300_000, scheduleDays: [1, 3, 5], teacherId, salaryPercentBp: 4000, startDate: start },
    });
    const student = await createUser({ role: "STUDENT" });
    const enrollment = await testDb().enrollment.create({
      data: { studentId: student.id, courseId: c.id, groupId: group.id, startsAt: start, priceOverride: 300_000 },
    });
    // Закрытые месяцы с начислениями — запись при отчислении сохраняется
    expect((await send("delete", `/groups/${group.id}/students/${student.id}?alsoUnenroll=true`)).status).toBe(200);

    const after = await testDb().enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(after.groupId).toBeNull();
    expect(after.unenrolledAt).not.toBeNull();
    expect(after.unenrolledFromGroupId).toBe(group.id);

    const students = await get(`/salary/group-students?month=${current}&groupId=${group.id}`);
    expect(students.status).toBe(200);
    const row = students.body.students.find((s: { studentId: string }) => s.studentId === student.id);
    expect(row).toBeDefined();
    expect(row.unenrolled).toBe(true);
    expect(row.charged).toBeGreaterThan(0);

    const detail = await get(`/salary/${teacherId}?month=${current}`);
    const unit = detail.body.groups.find((g: { groupId: string }) => g.groupId === group.id);
    const month = unit.months.find((m: { month: string }) => m.month === current);
    expect(month.base).toBe(row.charged);
    expect(month.studentsCount).toBe(1);

    // Курса без группы у этого курса нет: отчисленный из группы туда не попадает
    const ungrouped = await get(`/salary/group-students?month=${current}&courseId=${c.id}`);
    expect(ungrouped.status).toBe(404);

    // Закрытый месяц отчисленного заморожен под группой, а не под null
    const charge = await testDb().monthlyCharge.findFirst({ where: { enrollmentId: enrollment.id, month: addMonths(current, -1) } });
    expect(charge?.groupId).toBe(group.id);
  });

  it("без личной цены: месяц отчисления считается по цене и расписанию прежней группы", async () => {
    const c = await course("noprice");
    // Занятия каждый день — чтобы до дня отчисления всегда было хоть одно
    const group = await testDb().group.create({
      data: { name: `GN-${run}`, courseId: c.id, branchId, price: 300_000, scheduleDays: [0, 1, 2, 3, 4, 5, 6], teacherId, startDate: start },
    });
    const student = await createUser({ role: "STUDENT" });
    await testDb().enrollment.create({
      data: { studentId: student.id, courseId: c.id, groupId: group.id, startsAt: start },
    });
    expect((await send("delete", `/groups/${group.id}/students/${student.id}?alsoUnenroll=true`)).status).toBe(200);

    // Ученик по-прежнему платит за дни до отчисления, а не ноль
    const card = await get(`/billing/students/${student.id}`);
    const courseRow = card.body.courses.find((row: { course: { id: string } }) => row.course.id === c.id);
    const monthRow = courseRow.months.find((m: { month: string }) => m.month === current);
    expect(monthRow.charged).toBeGreaterThan(0);

    // И это же начисление — в базе зарплаты группы
    const students = await get(`/salary/group-students?month=${current}&groupId=${group.id}`);
    const row = students.body.students.find((s: { studentId: string }) => s.studentId === student.id);
    expect(row.charged).toBe(monthRow.charged);
  });

  it("возврат в группу сбрасывает unenrolledFromGroupId", async () => {
    const c = await course("return");
    const group = await testDb().group.create({
      data: { name: `GR-${run}`, courseId: c.id, branchId, price: 300_000, scheduleDays: [1, 3, 5], teacherId, startDate: start },
    });
    const student = await createUser({ role: "STUDENT" });
    const enrollment = await testDb().enrollment.create({
      data: {
        studentId: student.id,
        courseId: c.id,
        groupId: group.id,
        startsAt: start,
        unenrolledAt: new Date(),
        unenrolledFromGroupId: null,
      },
    });
    // Эмулируем итог removeStudent: группа снята, прежняя запомнена
    await testDb().enrollment.update({
      where: { id: enrollment.id },
      data: { groupId: null, unenrolledFromGroupId: group.id, billingEndsAt: new Date() },
    });

    const res = await send("post", `/groups/${group.id}/students`, { studentIds: [student.id] });
    expect(res.status).toBe(201);
    const after = await testDb().enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(after).toMatchObject({ groupId: group.id, unenrolledAt: null, unenrolledFromGroupId: null });
  });

  it("ученик без группы с ценой записи, отчисленный в текущем месяце, входит в единицу «курс без группы»", async () => {
    const c = await course("nogroup");
    const student = await createUser({ role: "STUDENT" });
    await testDb().enrollment.create({
      data: {
        studentId: student.id,
        courseId: c.id,
        startsAt: start,
        priceOverride: 246_000,
        billingEndsAt: new Date(),
        unenrolledAt: new Date(),
      },
    });

    const students = await get(`/salary/group-students?month=${current}&courseId=${c.id}`);
    expect(students.status).toBe(200);
    const row = students.body.students.find((s: { studentId: string }) => s.studentId === student.id);
    expect(row).toBeDefined();
    expect(row.unenrolled).toBe(true);
    expect(row.charged).toBeGreaterThan(0);
  });

  it("предупреждения должников не считают отчисленных без группы", async () => {
    const c = await course("debtors");
    const student = await createUser({ role: "STUDENT" });
    await testDb().enrollment.create({
      data: {
        studentId: student.id,
        courseId: c.id,
        startsAt: start,
        priceOverride: 100_000,
        billingEndsAt: new Date(),
        unenrolledAt: new Date(),
      },
    });
    const res = await get(`/billing/debtors?courseId=${c.id}`);
    expect(res.status).toBe(200);
    expect(res.body.withoutGroup).toBe(0);
    expect(res.body.withoutGroupStudents).toEqual([]);
    expect(res.body.groupWithoutSchedule).toBe(0);
  });
});
