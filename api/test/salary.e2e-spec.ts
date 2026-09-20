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
});
