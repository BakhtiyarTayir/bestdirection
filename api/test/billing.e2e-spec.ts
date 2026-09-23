import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("модуль billing", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  // Месяц по времени школы (Ташкент), а не UTC — иначе тест мог бы поехать
  // в окне 19:00–24:00 UTC, когда в Ташкенте уже следующий месяц
  const current = currentMonthKey();
  const prevMonth = addMonths(current, -1);

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user, { roleInToken: role });
    }

    const course = await testDb().course.create({
      data: { slug: `billing-${run}`, title: "Курс", teacherId: ids.TEACHER, price: 600000 },
    });
    ids.course = course.id;
    const branch = await createBranch();
    ids.branch = branch.id;
    const group = await testDb().group.create({
      data: { name: `G-${run}`, courseId: course.id, scheduleDays: [1, 3, 5], branchId: branch.id },
    });
    ids.group = group.id;
    const enrollment = await testDb().enrollment.create({
      data: {
        studentId: ids.STUDENT,
        courseId: course.id,
        groupId: group.id,
        startsAt: new Date(`${addMonths(current, -3)}-01T12:00:00.000Z`),
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

  describe("деньги доступны только администратору", () => {
    const paths = [
      "/billing/debtors",
      "/billing/debtors/count",
      "/billing/students",
      "/billing/payments",
      "/billing/payments/form-options",
    ];

    it.each(paths)("%s: администратор — 200", async (path) => {
      expect((await get(path, "ADMIN")).status).toBe(200);
    });

    it.each(paths)("%s: преподаватель — 403", async (path) => {
      expect((await get(path, "TEACHER")).status).toBe(403);
    });

    it.each(["STUDENT", "PARENT"])("%s не видит должников", async (role) => {
      expect((await get("/billing/debtors", role)).status).toBe(403);
    });

    it("аноним — 401", async () => {
      expect((await get("/billing/debtors")).status).toBe(401);
    });

    it("ученик не может завести оплату себе", async () => {
      const res = await send("post", "/billing/payments", "STUDENT", {
        studentId: ids.STUDENT,
        courseId: ids.course,
        amount: 100000,
        method: "CASH",
        paidAt: `${current}-05`,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("оплаты", () => {
    it("оплата без записи на курс не принимается", async () => {
      const other = await createUser({ role: "STUDENT" });
      const res = await send("post", "/billing/payments", "ADMIN", {
        studentId: other.id,
        courseId: ids.course,
        amount: 100000,
        method: "CASH",
        paidAt: `${current}-05`,
      });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("notEnrolled");
    });

    it("сумма нулём или строкой не проходит", async () => {
      for (const amount of [0, -5, "100000"]) {
        const res = await send("post", "/billing/payments", "ADMIN", {
          studentId: ids.STUDENT,
          courseId: ids.course,
          amount,
          method: "CASH",
          paidAt: `${current}-05`,
        });
        expect(res.status, `сумма ${amount}`).toBe(400);
      }
    });

    it("оплата создаётся, попадает в журнал и гасит долг", async () => {
      const before = await get("/billing/debtors", "ADMIN");
      const debtBefore = before.body.debtors.find(
        (row: { enrollmentId: string }) => row.enrollmentId === ids.enrollment
      );
      expect(debtBefore.debt).toBeGreaterThan(0);

      const res = await send("post", "/billing/payments", "ADMIN", {
        studentId: ids.STUDENT,
        courseId: ids.course,
        amount: debtBefore.debt,
        method: "CASH",
        paidAt: `${current}-05`,
        forMonth: prevMonth,
        comment: "полная оплата",
      });
      expect(res.status).toBe(201);
      ids.payment = res.body.id;

      const log = await testDb().auditLog.findFirst({
        where: { entityType: "Payment", entityId: ids.payment, action: "CREATE" },
      });
      expect(log).not.toBeNull();

      const after = await get("/billing/debtors", "ADMIN");
      const stillDebtor = after.body.debtors.some(
        (row: { enrollmentId: string }) => row.enrollmentId === ids.enrollment
      );
      expect(stillDebtor).toBe(false);
    });

    it("филиал платежа — снимок из группы, а не ссылка на неё", async () => {
      const row = await testDb().payment.findUnique({ where: { id: ids.payment } });
      expect(row?.branchId).toBe(ids.branch);
    });

    it("журнал оплат фильтруется по филиалу", async () => {
      const inBranch = await get(`/billing/payments?branchId=${ids.branch}`, "ADMIN");
      expect(inBranch.body.payments.map((p: { id: string }) => p.id)).toContain(ids.payment);

      const otherBranch = await testDb().branch.create({ data: { name: `Платежи-${run}` } });
      const outOfBranch = await get(`/billing/payments?branchId=${otherBranch.id}`, "ADMIN");
      expect(outOfBranch.body.payments.map((p: { id: string }) => p.id)).not.toContain(ids.payment);
    });

    it("должники фильтруются по филиалу через группу", async () => {
      // Новая запись с долгом в ids.branch: старая (ids.enrollment) уже
      // полностью оплачена предыдущим тестом и в debtors больше не попадает
      const debtor = await createUser({ role: "STUDENT" });
      const enrollment = await testDb().enrollment.create({
        data: {
          studentId: debtor.id,
          courseId: ids.course,
          groupId: ids.group,
          startsAt: new Date(`${addMonths(current, -3)}-01T12:00:00.000Z`),
        },
      });

      const inBranch = await get(`/billing/debtors?branchId=${ids.branch}`, "ADMIN");
      expect(
        inBranch.body.debtors.some((row: { enrollmentId: string }) => row.enrollmentId === enrollment.id)
      ).toBe(true);

      const otherBranch = await testDb().branch.create({ data: { name: `Другой-${run}` } });
      const outOfBranch = await get(`/billing/debtors?branchId=${otherBranch.id}`, "ADMIN");
      expect(
        outOfBranch.body.debtors.some((row: { enrollmentId: string }) => row.enrollmentId === enrollment.id)
      ).toBe(false);
    });

    it("удаление оплаты мягкое: строка остаётся с deletedAt", async () => {
      const res = await send("delete", `/billing/payments/${ids.payment}`, "ADMIN");
      expect(res.status).toBe(200);
      const row = await testDb().payment.findUnique({ where: { id: ids.payment } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
      expect((await send("delete", `/billing/payments/${ids.payment}`, "ADMIN")).body.message).toBe(
        "paymentNotFound"
      );
    });
  });

  describe("карточка записи и пересчёт", () => {
    it("карточка показывает подсказку по первому месяцу", async () => {
      const res = await get(`/billing/enrollments/${ids.enrollment}`, "ADMIN");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ courseTitle: "Курс", hasSchedule: true });
      expect(res.body.suggestedFirstMonthCharge).toBeGreaterThan(0);
    });

    it("правка настроек замораживает закрытые месяцы до записи (аудит: прошлое не переписывается)", async () => {
      const res = await send("patch", `/billing/enrollments/${ids.enrollment}`, "ADMIN", {
        startsAt: `${addMonths(current, -3)}-01`,
        priceOverride: 900000,
      });
      expect(res.status).toBe(200);

      const frozen = await testDb().monthlyCharge.findMany({
        where: { enrollmentId: ids.enrollment },
        orderBy: { month: "asc" },
      });
      // Все закрытые месяцы зафиксированы по старой цене курса
      expect(frozen.length).toBeGreaterThan(0);
      expect(frozen.every((row) => row.priceUsed === 600000)).toBe(true);
    });

    it("текущий месяц пересчитать нельзя — он ещё не закрыт", async () => {
      const res = await send("post", `/billing/enrollments/${ids.enrollment}/recalc?month=${current}`, "ADMIN");
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("monthNotClosed");
    });

    it("пересчёт закрытого месяца идёт по зафиксированной цене и пишет в журнал", async () => {
      const preview = await get(
        `/billing/enrollments/${ids.enrollment}/recalc?month=${prevMonth}`,
        "ADMIN"
      );
      expect(preview.status).toBe(200);
      expect(preview.body.priceUsed).toBe(600000);

      const res = await send(
        "post",
        `/billing/enrollments/${ids.enrollment}/recalc?month=${prevMonth}`,
        "ADMIN"
      );
      expect(res.status).toBe(201);

      const row = await testDb().monthlyCharge.findFirst({
        where: { enrollmentId: ids.enrollment, month: prevMonth },
      });
      // Цена месяца осталась прежней, несмотря на priceOverride 900000
      expect(row?.priceUsed).toBe(600000);
      expect(row?.amount).toBe(600000);
    });
  });

  describe("карточка студента", () => {
    it("показывает помесячную историю и баланс", async () => {
      const res = await get(`/billing/students/${ids.STUDENT}`, "ADMIN");
      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(ids.STUDENT);
      expect(res.body.courses[0].months.length).toBeGreaterThan(0);
      expect(res.body.totals).toHaveProperty("balance");
    });

    it("несуществующий студент — 404", async () => {
      expect((await get("/billing/students/no-such-id", "ADMIN")).status).toBe(404);
    });

    // Правка «карточка ученика показывает будущие месяцы как долг»:
    // resolveSchedules раньше доводился до месяца ПОСЛЕДНЕЙ оплаты по ВСЕМ
    // курсам студента — аванс за курс A дописывал курсу B начисления за
    // месяцы, которые ещё не наступили. Свои студент/курсы/группа, чтобы не
    // задеть баланс ids.enrollment из describe выше.
    describe("будущие месяцы одного курса не начисляются другому (правка)", () => {
      it("курс без аванса не получает месяцы позже текущего, а его баланс сходится со списком", async () => {
        const branch = await createBranch(`Карточка-${run}`);
        const student = await createUser({ role: "STUDENT" });

        const courseA = await testDb().course.create({
          data: { slug: `billing-card-a-${run}`, title: "Курс A", teacherId: ids.TEACHER, price: 500000 },
        });
        const courseB = await testDb().course.create({
          data: { slug: `billing-card-b-${run}`, title: "Курс B", teacherId: ids.TEACHER, price: 300000 },
        });
        const groupA = await testDb().group.create({
          data: { name: `CA-${run}`, courseId: courseA.id, scheduleDays: [1, 3, 5], branchId: branch.id },
        });
        const groupB = await testDb().group.create({
          data: { name: `CB-${run}`, courseId: courseB.id, scheduleDays: [2, 4], branchId: branch.id },
        });

        const startsAt = new Date(`${addMonths(current, -3)}-01T12:00:00.000Z`);
        await testDb().enrollment.create({
          data: { studentId: student.id, courseId: courseA.id, groupId: groupA.id, startsAt },
        });
        await testDb().enrollment.create({
          data: { studentId: student.id, courseId: courseB.id, groupId: groupB.id, startsAt },
        });

        // Аванс по курсу A — за месяц на два вперёд от текущего
        const futureMonth = addMonths(current, 2);
        const prepaidAmount = 500000;
        await send("post", "/billing/payments", "ADMIN", {
          studentId: student.id,
          courseId: courseA.id,
          amount: prepaidAmount,
          method: "CASH",
          paidAt: `${current}-05`,
          forMonth: futureMonth,
        });

        const res = await get(`/billing/students/${student.id}`, "ADMIN");
        expect(res.status).toBe(200);
        expect(res.body.upToMonth).toBe(current);

        const cardA = res.body.courses.find((c: { course: { id: string } }) => c.course.id === courseA.id);
        const cardB = res.body.courses.find((c: { course: { id: string } }) => c.course.id === courseB.id);
        expect(cardA).toBeDefined();
        expect(cardB).toBeDefined();

        // Курс B без аванса — у него нет ни одного месяца позже текущего
        expect(cardB.months.every((m: { month: string }) => m.month <= current)).toBe(true);
        // Баланс курса B = -(начислено), как в списке студентов на текущий месяц
        expect(cardB.balance).toBe(-cardB.totalCharged);
        expect(cardB.prepaidFuture).toBe(0);

        // Курс A: аванс за будущий месяц вынесен отдельно и не искажает баланс
        expect(cardA.prepaidFuture).toBe(prepaidAmount);
        expect(cardA.balance).toBe(cardA.totalPaid - cardA.totalCharged);

        // Список студентов считает баланс на текущий месяц — карточка курса B
        // (без аванса) должна с ним сойтись buck-for-buck
        const overview = await get(`/billing/students?branchId=${branch.id}`, "ADMIN");
        const overviewRow = overview.body.find((s: { id: string }) => s.id === student.id);
        expect(overviewRow).toBeDefined();
        // В списке баланс студента суммарный по всем его курсам — совпадает
        // с суммой курсовых балансов карточки (без учёта аванса, он туда и
        // не входит — аванс за будущее у debtors() тоже не в текущем долге)
        expect(overviewRow.balance).toBe(cardA.balance + cardB.balance);
      });
    });
  });

  // Правка «оплата: groupId от клиента не проверяется» — PaymentsService.create
  // раньше принимал ЛЮБОЙ groupId из тела запроса без проверки принадлежности
  // курсу, и у платежа сохранялся чужой филиал (branchId — снимок из группы).
  describe("оплата: чужой groupId отклоняется (правка)", () => {
    it("группа другого курса — 400 groupMismatch", async () => {
      const otherCourse = await testDb().course.create({
        data: { slug: `billing-mismatch-${run}`, title: "Другой курс", teacherId: ids.TEACHER, price: 200000 },
      });
      const otherBranch = await createBranch(`Чужой-${run}`);
      const otherGroup = await testDb().group.create({
        data: { name: `OG-${run}`, courseId: otherCourse.id, scheduleDays: [1], branchId: otherBranch.id },
      });

      // ids.STUDENT записан на ids.course (см. beforeAll) — шлём его же
      // курс, но группу ЧУЖОГО курса
      const res = await send("post", "/billing/payments", "ADMIN", {
        studentId: ids.STUDENT,
        courseId: ids.course,
        groupId: otherGroup.id,
        amount: 100000,
        method: "CASH",
        paidAt: `${current}-05`,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("groupMismatch");
    });

    it("несуществующий groupId — тоже 400 groupMismatch", async () => {
      const res = await send("post", "/billing/payments", "ADMIN", {
        studentId: ids.STUDENT,
        courseId: ids.course,
        groupId: "no-such-group",
        amount: 100000,
        method: "CASH",
        paidAt: `${current}-05`,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("groupMismatch");
    });

    it("groupId, совпадающий с группой записи — по-прежнему принимается", async () => {
      const res = await send("post", "/billing/payments", "ADMIN", {
        studentId: ids.STUDENT,
        courseId: ids.course,
        groupId: ids.group,
        amount: 100000,
        method: "CASH",
        paidAt: `${current}-05`,
      });
      expect(res.status).toBe(201);
      await send("delete", `/billing/payments/${res.body.id}`, "ADMIN");
    });
  });
});
