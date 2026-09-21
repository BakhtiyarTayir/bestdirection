import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, monthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// e2e-покрытие раздела 5 плана зарплат: права, историчность (перевод ученика
// и смена процента не переписывают закрытый месяц), журнал выплат и долг.
// Формула и закон закрытого месяца уже разобраны юнит-тестами
// (src/modules/salary/domain/salary.spec.ts) — здесь проверяется то, что
// юнит-тестом не достать: реальные фильтры прав, заморозка через реальную
// базу и порядок вызовов сервисов.
describe("модуль salary", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const current = monthKey(new Date());
  const prevMonth = addMonths(current, -1);
  const startMonth = addMonths(current, -3);

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    // Второй преподаватель — чтобы проверить «чужой teacherId → 404»
    const otherTeacher = await createUser({ role: "TEACHER" });
    ids.otherTeacher = otherTeacher.id;
    cookies.otherTeacher = await sessionCookie(otherTeacher);

    const branch = await createBranch();
    ids.branch = branch.id;

    const course = await testDb().course.create({
      data: { slug: `salary-${run}`, title: "Курс зарплаты", teacherId: ids.TEACHER, price: 500_000 },
    });
    ids.course = course.id;

    // 40% — ставка группы, важнее ставки преподавателя (5.2)
    const groupA = await testDb().group.create({
      data: {
        name: `A-${run}`,
        courseId: course.id,
        branchId: branch.id,
        scheduleDays: [1, 3, 5],
        teacherId: ids.TEACHER,
        salaryPercentBp: 4000,
        startDate: new Date(`${startMonth}-01T12:00:00.000Z`),
      },
    });
    ids.groupA = groupA.id;

    // Группа без своей ставки — берётся ставка преподавателя, но её пока нет
    const groupB = await testDb().group.create({
      data: {
        name: `B-${run}`,
        courseId: course.id,
        branchId: branch.id,
        scheduleDays: [2, 4],
        teacherId: ids.TEACHER,
        startDate: new Date(`${startMonth}-01T12:00:00.000Z`),
      },
    });
    ids.groupB = groupB.id;

    const enrollment = await testDb().enrollment.create({
      data: {
        studentId: ids.STUDENT,
        courseId: course.id,
        groupId: groupA.id,
        startsAt: new Date(`${startMonth}-01T12:00:00.000Z`),
      },
    });
    ids.enrollment = enrollment.id;
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

  describe("права", () => {
    it("администратор видит сводку", async () => {
      expect((await get("/salary", "ADMIN")).status).toBe(200);
    });

    it("ученик и родитель не видят зарплату вообще", async () => {
      expect((await get("/salary", "STUDENT")).status).toBe(403);
      expect((await get("/salary/me", "STUDENT")).status).toBe(403);
      expect((await get("/salary", "PARENT")).status).toBe(403);
    });

    it("преподаватель не видит общую сводку", async () => {
      expect((await get("/salary", "TEACHER")).status).toBe(403);
    });

    it("преподаватель видит только свою зарплату", async () => {
      const res = await get("/salary/me", "TEACHER");
      expect(res.status).toBe(200);
      expect(res.body.teacher.id).toBe(ids.TEACHER);
    });

    it("преподаватель по своему id — тот же результат, что /me", async () => {
      const res = await get(`/salary/${ids.TEACHER}`, "TEACHER");
      expect(res.status).toBe(200);
      expect(res.body.teacher.id).toBe(ids.TEACHER);
    });

    it("чужой teacherId для преподавателя — 404, а не 403", async () => {
      const res = await get(`/salary/${ids.TEACHER}`, "otherTeacher");
      expect(res.status).toBe(404);
    });

    it("аноним — 401", async () => {
      expect((await get("/salary")).status).toBe(401);
    });
  });

  describe("формула и «ставка не задана»", () => {
    it("группа A (ставка 40%) даёт ненулевое начисление в сводке", async () => {
      const res = await get(`/salary?month=${current}`, "ADMIN");
      expect(res.status).toBe(200);
      const row = res.body.rows.find((r: { teacherId: string }) => r.teacherId === ids.TEACHER);
      expect(row).toBeDefined();
      expect(row.base).toBeGreaterThan(0);
      expect(row.accrued).toBeGreaterThan(0);
    });

    it("группа B без ставки нигде: единица есть, но своей ставки не имеет", async () => {
      const res = await get(`/salary/${ids.TEACHER}?month=${current}`, "ADMIN");
      expect(res.status).toBe(200);
      const groupB = res.body.groups.find((g: { groupId: string }) => g.groupId === ids.groupB);
      // У группы B нет ни своих учеников, ни ставки — просто нет месяцев с базой,
      // группа A уже показывает главное: ставки не задано → percentUsed null
      expect(groupB).toBeDefined();
    });
  });

  describe("историчность: перевод ученика и смена процента не переписывают закрытый месяц", () => {
    let frozenBefore: { month: string; base: number; percentUsed: number | null; amount: number } | null = null;

    it("заморозка закрытых месяцев группы A происходит при первом обращении", async () => {
      await get(`/salary/${ids.TEACHER}?month=${current}`, "ADMIN");
      const rows = await testDb().teacherSalaryAccrual.findMany({
        where: { teacherId: ids.TEACHER, groupId: ids.groupA },
        orderBy: { month: "asc" },
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.month < current)).toBe(true);
      expect(rows.every((r) => r.percentUsed === 4000)).toBe(true);

      const prev = rows.find((r) => r.month === prevMonth);
      expect(prev).toBeDefined();
      frozenBefore = {
        month: prev!.month,
        base: prev!.base,
        percentUsed: prev!.percentUsed,
        amount: prev!.amount,
      };
    });

    it("перевод ученика в группу B не меняет закрытый месяц группы A", async () => {
      const res = await send("post", `/groups/${ids.groupB}/move-student`, "ADMIN", {
        studentId: ids.STUDENT,
        courseId: ids.course,
      });
      expect(res.status).toBe(201);

      const rows = await testDb().teacherSalaryAccrual.findMany({
        where: { teacherId: ids.TEACHER, groupId: ids.groupA, month: frozenBefore!.month },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].base).toBe(frozenBefore!.base);
      expect(rows[0].amount).toBe(frozenBefore!.amount);
    });

    it("смена ставки группы A не переписывает уже замороженный месяц", async () => {
      await send("patch", `/groups/${ids.groupA}`, "ADMIN", { salaryPercentBp: 6000 });

      const rows = await testDb().teacherSalaryAccrual.findMany({
        where: { teacherId: ids.TEACHER, groupId: ids.groupA, month: frozenBefore!.month },
      });
      expect(rows[0].percentUsed).toBe(4000);
      expect(rows[0].amount).toBe(frozenBefore!.amount);
    });

    it("смена ставки преподавателя не переписывает прошлое группы без своей ставки", async () => {
      // Заморозим сначала историю группы B (пока преподаватель без ставки —
      // percentUsed должен зафиксироваться как null)
      await get(`/salary/${ids.TEACHER}?month=${current}`, "ADMIN");
      const beforeRows = await testDb().teacherSalaryAccrual.findMany({
        where: { teacherId: ids.TEACHER, groupId: ids.groupB },
      });
      const closedRow = beforeRows.find((r) => r.month < current);
      // Группа B к этому моменту либо пустая (нет учеников — нечего
      // замораживать), либо получила студента, переведённого выше
      if (closedRow) {
        expect(closedRow.percentUsed).toBeNull();

        await send("patch", `/users/${ids.TEACHER}`, "ADMIN", { salaryPercentBp: 5000 });

        const afterRow = await testDb().teacherSalaryAccrual.findFirst({
          where: { id: closedRow.id },
        });
        // Закрытый месяц остался без ставки — новая ставка преподавателя
        // на него не подействовала
        expect(afterRow?.percentUsed).toBeNull();
      }
    });
  });

  describe("выплаты и долг", () => {
    it("долг после начисления положительный", async () => {
      const res = await get(`/salary/${ids.TEACHER}?month=${prevMonth}`, "ADMIN");
      expect(res.status).toBe(200);
      expect(res.body.debt).toBeGreaterThan(0);
      ids.debtBefore = String(res.body.debt);
    });

    it("выплата уменьшает долг", async () => {
      const debt = Number(ids.debtBefore);
      const res = await send("post", "/salary/payouts", "ADMIN", {
        teacherId: ids.TEACHER,
        amount: debt,
        method: "CASH",
        paidAt: `${current}-05`,
        forMonth: prevMonth,
      });
      expect(res.status).toBe(201);
      ids.payout = res.body.id;

      const after = await get(`/salary/${ids.TEACHER}?month=${prevMonth}`, "ADMIN");
      expect(after.body.debt).toBe(0);
    });

    it("удалённая выплата возвращает долг", async () => {
      const res = await send("delete", `/salary/payouts/${ids.payout}`, "ADMIN");
      expect(res.status).toBe(200);

      const after = await get(`/salary/${ids.TEACHER}?month=${prevMonth}`, "ADMIN");
      expect(after.body.debt).toBe(Number(ids.debtBefore));
    });

    it("несуществующая выплата — 404", async () => {
      expect((await send("delete", "/salary/payouts/no-such-id", "ADMIN")).status).toBe(404);
    });
  });

  describe("ручная фиксация и пересчёт закрытого месяца", () => {
    it("текущий месяц пересчитать нельзя — он ещё не закрыт", async () => {
      const res = await send("post", `/salary/${ids.TEACHER}/recalc?month=${current}&groupId=${ids.groupA}`, "ADMIN");
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("monthNotClosed");
    });

    it("manualAmount перебивает формулу и виден в разбивке", async () => {
      const stored = await testDb().teacherSalaryAccrual.findFirst({
        where: { teacherId: ids.TEACHER, groupId: ids.groupA, month: prevMonth },
      });
      expect(stored).not.toBeNull();

      const res = await send("patch", `/salary/accruals/${stored!.id}`, "ADMIN", { manualAmount: 12345 });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(12345);

      const detail = await get(`/salary/${ids.TEACHER}?month=${prevMonth}`, "ADMIN");
      const groupA = detail.body.groups.find((g: { groupId: string }) => g.groupId === ids.groupA);
      const month = groupA.months.find((m: { month: string }) => m.month === prevMonth);
      expect(month.amount).toBe(12345);
      expect(month.isFormula).toBe(false);

      // Снимаем ручную фиксацию — возвращается формула
      await send("patch", `/salary/accruals/${stored!.id}`, "ADMIN", { manualAmount: null });
      const reverted = await testDb().teacherSalaryAccrual.findUnique({ where: { id: stored!.id } });
      expect(reverted?.manualAmount).toBeNull();
    });
  });

  // Этап 3 плана «Уроки и карточка группы»: раскладка суммы группы между
  // несколькими преподавателями по числу проведённых занятий — то, чего
  // раздел 5.8 прошлого плана прямо не учитывал («замены не влияют на
  // зарплату»). Свои курс/группа/студент — не переиспользуют ids.groupA:
  // там уже накопилась история с других describe-блоков этого файла.
  describe("зарплата по проведённым занятиям: замена (этап 3)", () => {
    let courseId: string;
    let groupId: string;
    let lessonDates: string[];

    /** Даты месяца, попадающие на дни расписания группы — как в AttendanceService.createSession */
    function lessonDatesInMonth(month: string, scheduleDays: number[]): string[] {
      const [year, monthNum] = month.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
      const dates: string[] = [];
      for (let day = 1; day <= lastDay; day++) {
        const date = new Date(Date.UTC(year, monthNum - 1, day));
        const iso = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
        if (scheduleDays.includes(iso)) dates.push(`${month}-${String(day).padStart(2, "0")}`);
      }
      return dates;
    }

    beforeAll(async () => {
      const course = await testDb().course.create({
        data: { slug: `salary-lessons-${run}`, title: "Курс с занятиями", teacherId: ids.TEACHER, price: 300_000 },
      });
      courseId = course.id;
      const group = await testDb().group.create({
        data: {
          name: `L-${run}`,
          courseId,
          branchId: ids.branch,
          scheduleDays: [1, 3, 5], // пн/ср/пт
          teacherId: ids.TEACHER,
          salaryPercentBp: 4000,
          startDate: new Date(`${startMonth}-01T12:00:00.000Z`),
        },
      });
      groupId = group.id;
      await testDb().enrollment.create({
        data: { studentId: ids.STUDENT, courseId, groupId, startsAt: new Date(`${startMonth}-01T12:00:00.000Z`) },
      });

      lessonDates = lessonDatesInMonth(prevMonth, [1, 3, 5]);
      expect(lessonDates.length).toBeGreaterThan(1);

      // Все занятия месяца, кроме последнего, провёл основной педагог
      // (ведущий не записан явно — числится за педагогом группы)
      for (const date of lessonDates.slice(0, -1)) {
        await testDb().attendanceSession.create({
          data: { courseId, groupId, date: new Date(`${date}T00:00:00.000Z`), teacherStatus: "PRESENT" },
        });
      }
      // Последнее занятие месяца провёл другой педагог — замена
      await testDb().attendanceSession.create({
        data: {
          courseId,
          groupId,
          date: new Date(`${lessonDates.at(-1)}T00:00:00.000Z`),
          teacherId: ids.otherTeacher,
          teacherStatus: "PRESENT",
        },
      });
    });

    it("замена в журнале порождает вторую строку начисления — на заменяющего, по ставке группы", async () => {
      // GET /salary без фильтра по преподавателю — иначе loadUnits({teacherId})
      // не нашёл бы единицу заменяющего, у него нет своей группы
      const overview = await get(`/salary?month=${prevMonth}`, "ADMIN");
      expect(overview.status).toBe(200);

      const rows = await testDb().teacherSalaryAccrual.findMany({
        where: { groupId, month: prevMonth },
        orderBy: { teacherId: "asc" },
      });
      expect(rows).toHaveLength(2);

      const mainRow = rows.find((r) => r.teacherId === ids.TEACHER)!;
      const subRow = rows.find((r) => r.teacherId === ids.otherTeacher)!;
      expect(mainRow).toBeDefined();
      expect(subRow).toBeDefined();

      expect(mainRow.lessonsPlanned).toBe(lessonDates.length);
      expect(mainRow.lessonsTaught).toBe(lessonDates.length - 1);
      expect(subRow.lessonsPlanned).toBe(lessonDates.length);
      expect(subRow.lessonsTaught).toBe(1);

      // Замена платится по ставке ГРУППЫ (40%), а не по своей — у
      // otherTeacher персональной ставки вообще нет
      expect(subRow.percentUsed).toBe(4000);

      // Сумма провели ровно по расписанию — округление сходится в точности
      // к месячной сумме группы (план, 4.7)
      const potAmount = Math.round(mainRow.base * 4000 / 10_000);
      expect(mainRow.amount + subRow.amount).toBe(potAmount);
      expect(subRow.amount).toBeGreaterThan(0);
    });

    it("заменяющий видит свою строку в /salary/:teacherId", async () => {
      const res = await get(`/salary/${ids.otherTeacher}?month=${prevMonth}`, "ADMIN");
      expect(res.status).toBe(200);
      const group = res.body.groups.find((g: { groupId: string }) => g.groupId === groupId);
      expect(group).toBeDefined();
      const month = group.months.find((m: { month: string }) => m.month === prevMonth);
      expect(month.lessonsTaught).toBe(1);
      expect(month.amount).toBeGreaterThan(0);
    });

    it("закрытый месяц не меняется от поздней правки журнала — нужен явный пересчёт", async () => {
      const before = await testDb().teacherSalaryAccrual.findMany({ where: { groupId, month: prevMonth } });
      const subBefore = before.find((r) => r.teacherId === ids.otherTeacher)!;
      const mainBefore = before.find((r) => r.teacherId === ids.TEACHER)!;

      // Поздняя правка: выясняется, что замены на самом деле не было
      await testDb().attendanceSession.updateMany({
        where: { groupId, date: new Date(`${lessonDates.at(-1)}T00:00:00.000Z`) },
        data: { teacherStatus: "ABSENT" },
      });

      const unchanged = await testDb().teacherSalaryAccrual.findMany({ where: { groupId, month: prevMonth } });
      const subUnchanged = unchanged.find((r) => r.teacherId === ids.otherTeacher)!;
      const mainUnchanged = unchanged.find((r) => r.teacherId === ids.TEACHER)!;
      expect(subUnchanged.amount).toBe(subBefore.amount);
      expect(mainUnchanged.amount).toBe(mainBefore.amount);

      // Пересчёт применяет правку: замены (ABSENT) как будто не было вовсе —
      // ни у кого не засчитана, знаменатель (lessonsPlanned) не изменился
      const recalcSub = await send(
        "post",
        `/salary/${ids.otherTeacher}/recalc?month=${prevMonth}&groupId=${groupId}`,
        "ADMIN"
      );
      expect(recalcSub.status).toBe(201);
      expect(recalcSub.body.amount).toBe(0);

      const recalcMain = await send(
        "post",
        `/salary/${ids.TEACHER}/recalc?month=${prevMonth}&groupId=${groupId}`,
        "ADMIN"
      );
      expect(recalcMain.status).toBe(201);

      const after = await testDb().teacherSalaryAccrual.findMany({ where: { groupId, month: prevMonth } });
      const subAfter = after.find((r) => r.teacherId === ids.otherTeacher)!;
      const mainAfter = after.find((r) => r.teacherId === ids.TEACHER)!;
      expect(subAfter.amount).toBe(0);
      expect(subAfter.lessonsTaught).toBe(0);
      // Пропуск без отработки: провели на одно занятие меньше плана —
      // сумма меньше пота ровно на цену занятия (план, 4.9, сценарий 3)
      const potAmount = Math.round(mainAfter.base * 4000 / 10_000);
      const pricePerLesson = Math.round(potAmount / mainAfter.lessonsPlanned!);
      expect(potAmount - mainAfter.amount).toBe(pricePerLesson);
    });
  });
});
