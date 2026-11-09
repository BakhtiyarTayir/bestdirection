import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, testDb, type TestApp } from "./helpers";

// Границы месяца в выборках журнала. AttendanceSession.date — @db.Date
// (полночь UTC), а monthStart/monthEnd отдают полдень 1-го и последнего
// числа. Занятие ровно 1-го и ровно последнего числа обязано попадать в
// месяц, занятие соседнего месяца — нет. Покрыты выборки, где граница идёт
// из monthStart/monthEnd: успеваемость ученика (фильтр в БД через
// record.session.date) и «отмечено N из M» в /attendance/groups.
describe("журнал посещаемости: границы месяца", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  // Закрытый месяц: не зависит от «сегодня» (в текущем плановый период обрезается датой)
  const month = addMonths(currentMonthKey(), -2);
  const before = addMonths(month, -1);
  const after = addMonths(month, 1);
  const lastDay = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  };
  const dateOf = (key: string, day: number) => new Date(`${key}-${String(day).padStart(2, "0")}T00:00:00.000Z`);

  const get = (path: string, role: string) =>
    request(app.getHttpServer()).get(`/api/v2${path}`).set("Cookie", cookies[role]);

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "STUDENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    const teacher = await createUser({ role: "TEACHER" });
    ids.teacher = teacher.id;
    const branch = await createBranch(`Границы-${run}`);

    const course = await testDb().course.create({
      data: { slug: `bound-${run}`, title: "Границы месяца", teacherId: teacher.id, price: 100_000 },
    });
    ids.course = course.id;
    // Расписание на каждый день — план месяца равен числу его дней
    const group = await testDb().group.create({
      data: {
        price: 100_000,
        name: `Gb-${run}`,
        courseId: course.id,
        branchId: branch.id,
        teacherId: teacher.id,
        scheduleDays: [1, 2, 3, 4, 5, 6, 7],
        startDate: new Date(`${addMonths(month, -3)}-01T12:00:00.000Z`),
      },
    });
    ids.group = group.id;
    await testDb().enrollment.create({
      data: { studentId: ids.STUDENT, courseId: course.id, groupId: group.id, startsAt: new Date(`${addMonths(month, -3)}-01T12:00:00.000Z`) },
    });

    // 1-е, последнее число месяца и по одному дню соседних месяцев
    const days: [string, number][] = [
      [month, 1],
      [month, lastDay(month)],
      [before, lastDay(before)],
      [after, 1],
    ];
    for (const [key, day] of days) {
      const session = await testDb().attendanceSession.create({
        data: { courseId: course.id, groupId: group.id, date: dateOf(key, day), teacherId: teacher.id },
      });
      await testDb().attendanceRecord.create({ data: { sessionId: session.id, studentId: ids.STUDENT, status: "ABSENT" } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("успеваемость: в месяц попадают 1-е и последнее число, соседние месяцы — нет", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}?month=${month}`, "ADMIN");
    expect(res.status).toBe(200);
    const course = res.body.courses.find((c: { course: { id: string } }) => c.course.id === ids.course);
    expect(course.attendance.total).toBe(2);
    expect(course.attendance.absentDates.sort()).toEqual([
      `${month}-01`,
      `${month}-${String(lastDay(month)).padStart(2, "0")}`,
    ]);
  });

  it("/attendance/groups: отмечено считает 1-е и последнее число месяца, соседние — нет", async () => {
    const res = await get(`/attendance/groups?groupId=${ids.group}&month=${month}`, "ADMIN");
    expect(res.status).toBe(200);
    const row = res.body.find((g: { groupId: string }) => g.groupId === ids.group);
    expect(row.plannedLessons).toBe(lastDay(month));
    expect(row.markedLessons).toBe(2);
  });
});
