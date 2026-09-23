import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, currentMonthKey } from "../src/modules/billing/domain/billing";
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
  // Месяц по времени школы (Ташкент), а не UTC — иначе тест мог бы поехать
  // в окне 19:00–24:00 UTC, когда в Ташкенте уже следующий месяц
  const current = currentMonthKey();
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
      data: { price: 500_000,
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
      data: { price: 500_000,
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
        data: { price: 300_000,
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

  // Правка «сводка зарплат задваивает базу при замене»: у группы с заменой
  // за месяц две единицы начисления (владелец и заменяющий, см. loadUnits),
  // и accrual.base/studentsCount у КАЖДОЙ — это ПОЛНАЯ база и полное число
  // учеников группы (делится по splitAccrualByTeacher только amount).
  // Наивная сумма по всем строкам сводки удваивала base/studentsCount/
  // groupsCount группы, у которой была замена. Свой филиал — иначе в
  // totals попадут groupA/groupB из describe выше.
  describe("сводка зарплат: замена не задваивает базу (правка)", () => {
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

    it("итог по базе, ученикам и группам не задваивается, начислено по-прежнему сходится", async () => {
      const branch = await createBranch("Дедуп");
      const course = await testDb().course.create({
        data: { slug: `salary-dedup-${run}`, title: "Курс дедуп", teacherId: ids.TEACHER, price: 300_000 },
      });
      const group = await testDb().group.create({
        data: { price: 300_000,
          name: `D-${run}`,
          courseId: course.id,
          branchId: branch.id,
          scheduleDays: [1, 3, 5],
          teacherId: ids.TEACHER,
          salaryPercentBp: 4000,
          startDate: new Date(`${startMonth}-01T12:00:00.000Z`),
        },
      });
      await testDb().enrollment.create({
        data: {
          studentId: ids.STUDENT,
          courseId: course.id,
          groupId: group.id,
          startsAt: new Date(`${startMonth}-01T12:00:00.000Z`),
        },
      });

      const lessonDates = lessonDatesInMonth(prevMonth, [1, 3, 5]);
      expect(lessonDates.length).toBeGreaterThan(1);

      // Все занятия месяца, кроме последнего, провёл основной педагог
      for (const date of lessonDates.slice(0, -1)) {
        await testDb().attendanceSession.create({
          data: { courseId: course.id, groupId: group.id, date: new Date(`${date}T00:00:00.000Z`), teacherStatus: "PRESENT" },
        });
      }
      // Последнее занятие — замена
      await testDb().attendanceSession.create({
        data: {
          courseId: course.id,
          groupId: group.id,
          date: new Date(`${lessonDates.at(-1)}T00:00:00.000Z`),
          teacherId: ids.otherTeacher,
          teacherStatus: "PRESENT",
        },
      });

      const overview = await get(`/salary?month=${prevMonth}&branchId=${branch.id}`, "ADMIN");
      expect(overview.status).toBe(200);

      const stored = await testDb().teacherSalaryAccrual.findMany({ where: { groupId: group.id, month: prevMonth } });
      expect(stored).toHaveLength(2);
      const mainRow = stored.find((r) => r.teacherId === ids.TEACHER)!;
      const subRow = stored.find((r) => r.teacherId === ids.otherTeacher)!;
      // Обе строки несут ПОЛНУЮ базу группы — так и задумано (справочный
      // контекст «с какой суммы считали»), делится только amount
      expect(mainRow.base).toBe(subRow.base);
      expect(mainRow.base).toBeGreaterThan(0);

      // Итог по базе/ученикам — база группы ОДИН раз, а не по разу на
      // строку начисления (владелец + заменяющий)
      expect(overview.body.totals.base).toBe(mainRow.base);
      expect(overview.body.totals.studentsCount).toBe(mainRow.studentsCount);
      expect(overview.body.totals.groupsCount).toBe(1);

      // Начисленное по-прежнему верно — эту правку сумма не затрагивает:
      // amount уже поделён между владельцем и заменяющим (splitAccrualByTeacher)
      expect(overview.body.totals.accrued).toBe(mainRow.amount + subRow.amount);

      // В строке отдельного преподавателя база осталась осмысленной — это
      // база группы, с которой считалась его доля, а не задвоенная сумма
      const mainRowInOverview = overview.body.rows.find((r: { teacherId: string }) => r.teacherId === ids.TEACHER);
      const subRowInOverview = overview.body.rows.find(
        (r: { teacherId: string }) => r.teacherId === ids.otherTeacher
      );
      expect(mainRowInOverview.base).toBe(mainRow.base);
      expect(subRowInOverview.base).toBe(mainRow.base);
    });
  });

  // Правка «история зарплаты идёт за нынешним составом группы»: база
  // закрытого месяца бралась по ученикам, которые в группе СЕЙЧАС, а
  // заморозка шла по отдельным педагогам. Перевод ученика приносил его
  // прошлые месяцы в базу новой группы (оплата дважды), смена педагога
  // группы давала новому педагогу начисления за всю её историю.
  describe("история зарплаты: перевод ученика и смена педагога группы", () => {
    let courseId: string;
    let groupOld: string;
    let groupNew: string;
    let studentId: string;
    let thirdTeacher: string;

    beforeAll(async () => {
      const branch = await createBranch("История");
      const course = await testDb().course.create({
        data: { slug: `salary-history-${run}`, title: "Курс истории", teacherId: ids.TEACHER, price: 300_000 },
      });
      courseId = course.id;
      const start = new Date(`${startMonth}-01T12:00:00.000Z`);
      groupOld = (
        await testDb().group.create({
          data: { price: 300_000, name: `Old-${run}`, courseId, branchId: branch.id, scheduleDays: [1, 3, 5], teacherId: ids.TEACHER, salaryPercentBp: 4000, startDate: start },
        })
      ).id;
      // Новая группа: другой педагог, та же ставка — чтобы задвоение
      // проявилось деньгами, а не нулём
      groupNew = (
        await testDb().group.create({
          data: { price: 300_000, name: `New-${run}`, courseId, branchId: branch.id, scheduleDays: [2, 4], teacherId: ids.otherTeacher, salaryPercentBp: 4000, startDate: start },
        })
      ).id;
      const student = await createUser({ role: "STUDENT" });
      studentId = student.id;
      await testDb().enrollment.create({ data: { studentId, courseId, groupId: groupOld, startsAt: start } });
      thirdTeacher = (await createUser({ role: "TEACHER" })).id;
    });

    it("переведённый ученик не попадает в закрытые месяцы новой группы", async () => {
      await get(`/salary?month=${current}`, "ADMIN");
      const res = await send("post", `/groups/${groupNew}/move-student`, "ADMIN", { studentId, courseId });
      expect(res.status).toBe(201);
      await get(`/salary?month=${current}`, "ADMIN");

      const oldRows = await testDb().teacherSalaryAccrual.findMany({ where: { groupId: groupOld, month: prevMonth } });
      expect(oldRows).toHaveLength(1);
      expect(oldRows[0].base).toBe(300_000);
      expect(oldRows[0].isOwner).toBe(true);

      // Раньше здесь появлялась строка с той же базой — повторная оплата
      const newRows = await testDb().teacherSalaryAccrual.findMany({ where: { groupId: groupNew, month: { lt: current } } });
      expect(newRows).toHaveLength(0);

      // Снимок группы в реестре начислений — прежняя группа
      const charge = await testDb().monthlyCharge.findFirst({ where: { enrollment: { studentId, courseId }, month: prevMonth } });
      expect(charge?.groupId).toBe(groupOld);
    });

    it("текущий месяц переведённого — уже в новой группе", async () => {
      const res = await get(`/salary/${ids.otherTeacher}?month=${current}`, "ADMIN");
      const group = res.body.groups.find((g: { groupId: string }) => g.groupId === groupNew);
      const month = group.months.find((m: { month: string }) => m.month === current);
      expect(month.base).toBeGreaterThan(0);
    });

    it("пересчёт закрытого месяца прежней группы не теряет переведённого", async () => {
      const res = await send("post", `/salary/${ids.TEACHER}/recalc?month=${prevMonth}&groupId=${groupOld}`, "ADMIN");
      expect(res.status).toBe(201);
      expect(res.body.changed).toBe(false);
      const row = await testDb().teacherSalaryAccrual.findFirst({ where: { groupId: groupOld, month: prevMonth } });
      expect(row?.base).toBe(300_000);
    });

    it("новый педагог группы не получает её прошлые месяцы, прежний их не теряет", async () => {
      const before = await testDb().teacherSalaryAccrual.findMany({ where: { groupId: groupOld } });
      expect(before.length).toBeGreaterThan(0);

      const res = await send("patch", `/groups/${groupOld}`, "ADMIN", { teacherId: thirdTeacher });
      expect(res.status).toBe(200);
      await get(`/salary?month=${current}`, "ADMIN");
      await get(`/salary/${thirdTeacher}?month=${current}`, "ADMIN");

      const stolen = await testDb().teacherSalaryAccrual.findMany({ where: { teacherId: thirdTeacher, groupId: groupOld } });
      expect(stolen).toHaveLength(0);

      // Прежний педагог по-прежнему видит закрытые месяцы этой группы
      const detail = await get(`/salary/${ids.TEACHER}?month=${current}`, "ADMIN");
      const group = detail.body.groups.find((g: { groupId: string }) => g.groupId === groupOld);
      expect(group).toBeDefined();
      const prev = group.months.find((m: { month: string }) => m.month === prevMonth);
      expect(prev.amount).toBe(120_000);
      expect(prev.locked).toBe(true);

      // Пересчёт прежнему педагогу не обнуляет его месяц: владелец того
      // месяца — он, а не нынешний педагог группы
      const recalc = await send("post", `/salary/${ids.TEACHER}/recalc?month=${prevMonth}&groupId=${groupOld}`, "ADMIN");
      expect(recalc.status).toBe(201);
      expect(recalc.body.amount).toBe(120_000);
    });

    it("пересчёт курса без группы требует курс, если таких курсов несколько", async () => {
      const start = new Date(`${startMonth}-01T12:00:00.000Z`);
      const courseIds: string[] = [];
      for (const suffix of ["a", "b"]) {
        const course = await testDb().course.create({
          data: { slug: `salary-nogroup-${suffix}-${run}`, title: `Без группы ${suffix}`, teacherId: thirdTeacher, price: 200_000 },
        });
        courseIds.push(course.id);
        const student = await createUser({ role: "STUDENT" });
        // Без группы цены группы нет, а цена курса в начислениях не участвует —
        // нужна своя цена ученика
        await testDb().enrollment.create({
          data: { studentId: student.id, courseId: course.id, startsAt: start, priceOverride: 200_000 },
        });
      }
      await get(`/salary/${thirdTeacher}?month=${current}`, "ADMIN");

      const ambiguous = await send("post", `/salary/${thirdTeacher}/recalc?month=${prevMonth}`, "ADMIN");
      expect(ambiguous.status).toBe(400);

      const exact = await send("post", `/salary/${thirdTeacher}/recalc?month=${prevMonth}&courseId=${courseIds[1]}`, "ADMIN");
      expect(exact.status).toBe(201);
    });
  });

  // Правка «сводка зарплат с фильтром по филиалу считает неверный долг»: с
  // branchId начисленное берётся только по единицам этого филиала, а выплаты
  // раньше подтягивались ВСЕ, независимо от их снимка branchId — долг
  // получался заниженным. Свои филиал/курс/группа/преподаватель, чтобы не
  // задеть долг из describe выше.
  describe("сводка зарплат с фильтром по филиалу: выплата другого филиала не уменьшает долг (правка)", () => {
    it("выплата со снимком чужого филиала не считается в долге отфильтрованной сводки, но считается в общей", async () => {
      const branchOwn = await createBranch("Долг-свой");
      const branchOther = await createBranch("Долг-чужой");
      const teacher = await createUser({ role: "TEACHER" });

      const course = await testDb().course.create({
        data: { slug: `salary-branch-debt-${run}`, title: "Курс долг филиала", teacherId: teacher.id, price: 400_000 },
      });
      const group = await testDb().group.create({
        data: { price: 400_000,
          name: `DB-${run}`,
          courseId: course.id,
          branchId: branchOwn.id,
          scheduleDays: [1, 3, 5],
          teacherId: teacher.id,
          salaryPercentBp: 5000,
          startDate: new Date(`${startMonth}-01T12:00:00.000Z`),
        },
      });
      const student = await createUser({ role: "STUDENT" });
      await testDb().enrollment.create({
        data: {
          studentId: student.id,
          courseId: course.id,
          groupId: group.id,
          startsAt: new Date(`${startMonth}-01T12:00:00.000Z`),
        },
      });

      const before = await get(`/salary?month=${prevMonth}&branchId=${branchOwn.id}`, "ADMIN");
      expect(before.status).toBe(200);
      const rowBefore = before.body.rows.find((r: { teacherId: string }) => r.teacherId === teacher.id);
      expect(rowBefore).toBeDefined();
      expect(rowBefore.debt).toBeGreaterThan(0);

      // Выплата со снимком ЧУЖОГО филиала — как если бы преподавателя
      // выплатили, пока он числился в другом филиале, а сюда перевели позже.
      // Пишем напрямую в базу: PayoutsService сам берёт branchId из
      // user.branchId преподавателя, а нам нужен именно рассинхрон снимков.
      await testDb().teacherPayout.create({
        data: {
          teacherId: teacher.id,
          amount: rowBefore.debt,
          method: "CASH",
          paidAt: new Date(`${current}-05T12:00:00.000Z`),
          forMonth: prevMonth,
          branchId: branchOther.id,
          createdById: ids.ADMIN,
        },
      });

      const afterFiltered = await get(`/salary?month=${prevMonth}&branchId=${branchOwn.id}`, "ADMIN");
      const rowAfterFiltered = afterFiltered.body.rows.find((r: { teacherId: string }) => r.teacherId === teacher.id);
      // Выплата снята с другого филиала — в сводке ЭТОГО филиала долг как был
      expect(rowAfterFiltered.debt).toBe(rowBefore.debt);

      // Без фильтра по филиалу выплата учитывается всегда — она реальна,
      // просто снимок филиала у неё не совпал с фильтром сводки
      const afterUnfiltered = await get(`/salary?month=${prevMonth}`, "ADMIN");
      const rowAfterUnfiltered = afterUnfiltered.body.rows.find(
        (r: { teacherId: string }) => r.teacherId === teacher.id
      );
      expect(rowAfterUnfiltered.debt).toBe(0);
    });
  });
});
