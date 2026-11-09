import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Отработка = явная галочка AttendanceSession.isMakeup. Обычные занятия сверх
// расписания денег не добавляют, отработка платится сверх суммы группы тому,
// кто её провёл. Чистые правила — в salary.spec.ts; здесь заморозка и
// пересчёт через реальную базу, права на галочку и предупреждение при
// создании занятия. Свои курсы и группы: общие фикстуры не трогаем.
describe("salary: отработки (isMakeup)", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const prevMonth = addMonths(currentMonthKey(), -1);
  const startMonth = addMonths(currentMonthKey(), -3);

  const http = () => request(app.getHttpServer());
  const get = (path: string, role: string) => http().get(`/api/v2${path}`).set("Cookie", cookies[role]);
  const send = (method: "post" | "patch", path: string, role: string, body?: object) =>
    http()[method](`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL).send(body);

  /** Даты месяца на указанных днях недели (ISO: 1 = пн) */
  function datesOn(month: string, weekdays: number[]): string[] {
    const [year, monthNum] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const out: string[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const iso = new Date(Date.UTC(year, monthNum - 1, day)).getUTCDay() || 7;
      if (weekdays.includes(iso)) out.push(`${month}-${String(day).padStart(2, "0")}`);
    }
    return out;
  }
  const at = (date: string) => new Date(`${date}T00:00:00.000Z`);

  async function makeGroup(tag: string) {
    const course = await testDb().course.create({
      data: { slug: `mk-${tag}-${run}`, title: `Отработки ${tag}`, teacherId: ids.TEACHER, price: 300_000 },
    });
    const group = await testDb().group.create({
      data: {
        price: 300_000,
        name: `MK${tag}-${run}`,
        courseId: course.id,
        branchId: ids.branch,
        scheduleDays: [1, 3, 5],
        teacherId: ids.TEACHER,
        salaryPercentBp: 4000,
        startDate: new Date(`${startMonth}-01T12:00:00.000Z`),
      },
    });
    await testDb().enrollment.create({
      data: { studentId: ids.STUDENT, courseId: course.id, groupId: group.id, startsAt: new Date(`${startMonth}-01T12:00:00.000Z`) },
    });
    return { courseId: course.id, groupId: group.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    const other = await createUser({ role: "TEACHER" });
    ids.other = other.id;
    cookies.other = await sessionCookie(other);
    ids.branch = (await createBranch()).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("закрытый месяц: сверх плана и отработки", () => {
    let courseId: string;
    let groupId: string;
    let planned: number;

    beforeAll(async () => {
      ({ courseId, groupId } = await makeGroup("A"));
      const lessons = datesOn(prevMonth, [1, 3, 5]);
      planned = lessons.length;
      for (const date of lessons) {
        await testDb().attendanceSession.create({ data: { courseId, groupId, date: at(date), teacherStatus: "PRESENT" } });
      }
      const [t1, t2, t3] = datesOn(prevMonth, [2]);
      // Обычное занятие сверх плана — денег не добавляет
      await testDb().attendanceSession.create({ data: { courseId, groupId, date: at(t1), teacherStatus: "PRESENT" } });
      // Отработка замены — идёт замене сверх суммы
      await testDb().attendanceSession.create({
        data: { courseId, groupId, date: at(t2), teacherId: ids.other, teacherStatus: "PRESENT", isMakeup: true },
      });
      // Отработка с ABSENT — не оплачивается
      await testDb().attendanceSession.create({
        data: { courseId, groupId, date: at(t3), teacherStatus: "ABSENT", isMakeup: true },
      });
      expect((await get(`/salary?month=${prevMonth}`, "ADMIN")).status).toBe(200);
    });

    it("заморозка: владелец получает ровно сумму группы, отработка замены — сверх неё", async () => {
      const rows = await testDb().teacherSalaryAccrual.findMany({ where: { groupId, month: prevMonth } });
      expect(rows).toHaveLength(2);
      const main = rows.find((r) => r.teacherId === ids.TEACHER)!;
      const sub = rows.find((r) => r.teacherId === ids.other)!;
      const pot = Math.round((main.base * 4000) / 10_000);
      expect(main.amount).toBe(pot);
      expect(main.lessonsTaught).toBe(planned + 1);
      expect(main.lessonsMakeup).toBe(0);
      expect(main.lessonsPlanned).toBe(planned);
      expect(sub.amount).toBe(Math.round(pot / planned));
      expect(sub.lessonsTaught).toBe(0);
      expect(sub.lessonsMakeup).toBe(1);
      expect(sub.lessonsPlanned).toBe(planned);
    });

    it("явный пересчёт не меняет то, что записала заморозка (одна функция расчёта)", async () => {
      const recalc = await send("post", `/salary/${ids.TEACHER}/recalc?month=${prevMonth}&groupId=${groupId}`, "ADMIN");
      expect(recalc.status).toBe(201);
      expect(recalc.body.changed).toBe(false);
    });

    it("карточка замены: отработка отдельно, список занятий с флагом", async () => {
      const res = await get(`/salary/${ids.other}?month=${prevMonth}`, "ADMIN");
      const month = res.body.groups.find((g: { groupId: string }) => g.groupId === groupId).months[0];
      expect(month.lessonsMakeup).toBe(1);
      expect(month.sessions).toEqual([{ date: datesOn(prevMonth, [2])[1], isMakeup: true }]);
      expect(month.amount).toBeGreaterThan(0);
    });

    it("галочку сняли — занятие становится обычным сверх плана: сверх суммы денег нет, делится сумма группы", async () => {
      await testDb().attendanceSession.updateMany({ where: { groupId, teacherId: ids.other }, data: { isMakeup: false } });
      const recalc = await send("post", `/salary/${ids.TEACHER}/recalc?month=${prevMonth}&groupId=${groupId}`, "ADMIN");
      expect(recalc.body.changed).toBe(true);
      const rows = await testDb().teacherSalaryAccrual.findMany({ where: { groupId, month: prevMonth } });
      const main = rows.find((r) => r.teacherId === ids.TEACHER)!;
      const sub = rows.find((r) => r.teacherId === ids.other)!;
      expect(sub.lessonsMakeup).toBe(0);
      expect(sub.lessonsTaught).toBe(1);
      expect(main.amount + sub.amount).toBe(Math.round((main.base * 4000) / 10_000));
    });
  });

  describe("неполный журнал: отработка не закрывает недобор, но оплачивается", () => {
    it("fallback остаётся, владелец получает сумму группы + отработку, замена с отработкой — свою строку", async () => {
      const { courseId, groupId } = await makeGroup("F");
      const lessons = datesOn(prevMonth, [1, 3, 5]);
      for (const date of lessons.slice(0, 2)) {
        await testDb().attendanceSession.create({ data: { courseId, groupId, date: at(date), teacherStatus: "PRESENT" } });
      }
      const [t1, t2] = datesOn(prevMonth, [2]);
      await testDb().attendanceSession.create({
        data: { courseId, groupId, date: at(t1), teacherStatus: "PRESENT", isMakeup: true },
      });
      await testDb().attendanceSession.create({
        data: { courseId, groupId, date: at(t2), teacherId: ids.other, teacherStatus: "PRESENT", isMakeup: true },
      });
      await get(`/salary?month=${prevMonth}`, "ADMIN");

      const rows = await testDb().teacherSalaryAccrual.findMany({ where: { groupId, month: prevMonth } });
      const main = rows.find((r) => r.teacherId === ids.TEACHER)!;
      const sub = rows.find((r) => r.teacherId === ids.other)!;
      const pot = Math.round((main.base * 4000) / 10_000);
      const price = Math.round(pot / lessons.length);
      expect(main.lessonsPlanned).toBeNull();
      expect(main.lessonsTaught).toBeNull();
      expect(main.lessonsMakeup).toBe(1);
      expect(main.amount).toBe(pot + price);
      expect(sub.amount).toBe(price);
      expect(sub.lessonsMakeup).toBe(1);
    });
  });

  describe("галочка «Отработка» в журнале и предупреждение", () => {
    let courseId: string;
    let groupId: string;
    let sessionId: string;

    beforeAll(async () => {
      ({ courseId, groupId } = await makeGroup("P"));
      for (const date of datesOn(prevMonth, [1, 3, 5])) {
        await testDb().attendanceSession.create({ data: { courseId, groupId, date: at(date) } });
      }
    });

    it("создание занятия сверх плана: админ и учитель получают overPlan, занятие создаётся", async () => {
      const [first, second] = datesOn(prevMonth, [2]);
      const byTeacher = await send("post", "/attendance/sessions", "TEACHER", { courseId, groupId, date: first });
      expect(byTeacher.status).toBe(201);
      expect(byTeacher.body.overPlan).toEqual({ month: prevMonth, planned: datesOn(prevMonth, [1, 3, 5]).length });
      sessionId = byTeacher.body.id;

      const byAdmin = await send("post", "/attendance/sessions", "ADMIN", { courseId, groupId, date: second });
      expect(byAdmin.status).toBe(201);
      expect(byAdmin.body.overPlan).not.toBeNull();
    });

    it("занятие в месяце без перебора плана — overPlan null", async () => {
      const { courseId: c, groupId: g } = await makeGroup("N");
      const res = await send("post", "/attendance/sessions", "TEACHER", { courseId: c, groupId: g, date: datesOn(prevMonth, [1])[0] });
      expect(res.status).toBe(201);
      expect(res.body.overPlan).toBeNull();
    });

    it("учитель ставит галочку; повторное сохранение без поля её не сбрасывает; снятие — аудит", async () => {
      const on = await send("patch", `/attendance/sessions/${sessionId}/records`, "TEACHER", {
        records: [],
        teacher: { isMakeup: true },
      });
      expect(on.status).toBe(200);
      expect((await testDb().attendanceSession.findUnique({ where: { id: sessionId } }))!.isMakeup).toBe(true);

      const resave = await send("patch", `/attendance/sessions/${sessionId}/records`, "TEACHER", {
        records: [],
        teacher: { status: "PRESENT" },
      });
      expect(resave.status).toBe(200);
      expect((await testDb().attendanceSession.findUnique({ where: { id: sessionId } }))!.isMakeup).toBe(true);

      const list = await get(`/attendance/sessions?courseId=${courseId}&groupId=${groupId}`, "TEACHER");
      expect(list.body.find((s: { id: string }) => s.id === sessionId).isMakeup).toBe(true);

      const off = await send("patch", `/attendance/sessions/${sessionId}/records`, "ADMIN", {
        records: [],
        teacher: { isMakeup: false },
      });
      expect(off.status).toBe(200);
      expect((await testDb().attendanceSession.findUnique({ where: { id: sessionId } }))!.isMakeup).toBe(false);

      const audit = await testDb().auditLog.findMany({ where: { entityType: "AttendanceSession", entityId: sessionId, action: "UPDATE" } });
      const changes = audit.map((a) => (a.metadata as { isMakeup?: { old: boolean; new: boolean } } | null)?.isMakeup).filter(Boolean);
      expect(changes).toEqual([
        { old: false, new: true },
        { old: true, new: false },
      ]);
    });

    it("чужой учитель галочку поставить не может", async () => {
      const res = await send("patch", `/attendance/sessions/${sessionId}/records`, "other", {
        records: [],
        teacher: { isMakeup: true },
      });
      expect(res.status).toBe(404);
    });
  });

  // Регресс по границе месяца: date у занятия — @db.Date (полночь UTC), а
  // monthStart() даёт полдень 1-го числа. Занятие ровно 1-го числа не должно
  // выпадать из выборки журнала: иначе полный журнал считается неполным
  describe("занятие 1-го числа месяца", () => {
    it("журнал полный, 1-е провела замена: fallback нет, доли делятся, замена получает строку", async () => {
      const course = await testDb().course.create({
        data: { slug: `mk-first-${run}`, title: "Отработки 1-е", teacherId: ids.TEACHER, price: 300_000 },
      });
      const group = await testDb().group.create({
        data: {
          price: 300_000,
          name: `MKfirst-${run}`,
          courseId: course.id,
          branchId: ids.branch,
          scheduleDays: [1, 2, 3, 4, 5, 6, 7], // каждый день: 1-е число точно плановое
          teacherId: ids.TEACHER,
          salaryPercentBp: 4000,
          startDate: new Date(`${startMonth}-01T12:00:00.000Z`),
        },
      });
      await testDb().enrollment.create({
        data: { studentId: ids.STUDENT, courseId: course.id, groupId: group.id, startsAt: new Date(`${startMonth}-01T12:00:00.000Z`) },
      });
      const days = datesOn(prevMonth, [1, 2, 3, 4, 5, 6, 7]);
      for (const date of days) {
        await testDb().attendanceSession.create({
          data: {
            courseId: course.id,
            groupId: group.id,
            date: at(date),
            teacherStatus: "PRESENT",
            ...(date === `${prevMonth}-01` ? { teacherId: ids.other } : {}),
          },
        });
      }
      expect((await get(`/salary?month=${prevMonth}`, "ADMIN")).status).toBe(200);

      const rows = await testDb().teacherSalaryAccrual.findMany({ where: { groupId: group.id, month: prevMonth } });
      const main = rows.find((r) => r.teacherId === ids.TEACHER)!;
      const sub = rows.find((r) => r.teacherId === ids.other);
      expect(main.lessonsPlanned).toBe(days.length);
      expect(main.lessonsTaught).toBe(days.length - 1);
      expect(sub?.lessonsTaught).toBe(1);

      const detail = await get(`/salary/${ids.TEACHER}?month=${prevMonth}`, "ADMIN");
      const month = detail.body.groups.find((g: { groupId: string }) => g.groupId === group.id).months.find((m: { month: string }) => m.month === prevMonth);
      expect(month.sessionsMarked).toBe(days.length);
      expect(month.fallback).toBe(false);
    });
  });
});
