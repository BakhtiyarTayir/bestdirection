import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingLedgerService } from "../src/modules/billing/billing-ledger.service";
import { addMonths, chargeForMonth, currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("модуль groups", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  // Месяц по времени школы (Ташкент), а не UTC — иначе тест мог бы поехать
  // в окне 19:00–24:00 UTC, когда в Ташкенте уже следующий месяц
  const current = currentMonthKey();

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user, { roleInToken: role });
    }
    const other = await createUser({ role: "TEACHER" });
    ids.otherTeacher = other.id;
    cookies.otherTeacher = await sessionCookie(other, { roleInToken: "TEACHER" });

    const own = await testDb().course.create({
      data: { slug: `g-own-${run}`, title: "Свой", teacherId: ids.TEACHER, price: 600000 },
    });
    ids.own = own.id;
    const foreign = await testDb().course.create({
      data: { slug: `g-foreign-${run}`, title: "Чужой", teacherId: ids.otherTeacher },
    });
    ids.foreign = foreign.id;

    const branch = await createBranch();
    ids.branch = branch.id;
    const otherBranch = await createBranch();
    ids.otherBranch = otherBranch.id;

    const foreignGroup = await testDb().group.create({
      data: { name: `FG-${run}`, courseId: foreign.id, branchId: branch.id },
    });
    ids.foreignGroup = foreignGroup.id;
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

  describe("состав группы — это контакты, значит только персоналу", () => {
    it.each(["STUDENT", "PARENT"])("%s не видит группы", async (role) => {
      expect((await get("/groups", role)).status).toBe(403);
      expect((await get(`/groups/${ids.foreignGroup}`, role)).status).toBe(403);
      expect((await get("/groups/teacher-options", role)).status).toBe(403);
    });

    it("персонал видит", async () => {
      expect((await get("/groups", "ADMIN")).status).toBe(200);
      expect((await get("/groups", "TEACHER")).status).toBe(200);
    });

    it("в разделе «Группы» преподаватель видит только свои курсы", async () => {
      const res = await get("/groups", "TEACHER");
      expect(res.body.every((g: { courseId: string }) => g.courseId !== ids.foreign)).toBe(true);
    });

    it("аноним — 401", async () => {
      expect((await get("/groups")).status).toBe(401);
    });
  });

  describe("создание и изменение", () => {
    it("группа создаётся, преподаватель по умолчанию — педагог курса", async () => {
      const res = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `A-${run}`,
        scheduleDays: [1, 3, 5],
        price: 600000,
      });
      expect(res.status).toBe(201);
      expect(res.body.teacherId).toBe(ids.TEACHER);
      expect(res.body.branchId).toBe(ids.branch);
      ids.group = res.body.id;
    });

    it("имя внутри курса и филиала уникально", async () => {
      const res = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `A-${run}`,
        scheduleDays: [1, 3, 5],
        price: 600000,
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("groupNameExists");
    });

    it("то же имя в другом филиале — не конфликт", async () => {
      const res = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.otherBranch,
        name: `A-${run}`,
        scheduleDays: [1, 3, 5],
        price: 600000,
      });
      expect(res.status).toBe(201);
      ids.sameNameOtherBranch = res.body.id;
    });

    it("GET /groups?branchId= фильтрует по филиалу", async () => {
      const inBranch = await get(`/groups?branchId=${ids.branch}`, "ADMIN");
      expect(inBranch.body.map((g: { id: string }) => g.id)).toContain(ids.group);
      expect(inBranch.body.map((g: { id: string }) => g.id)).not.toContain(ids.sameNameOtherBranch);

      const inOtherBranch = await get(`/groups?branchId=${ids.otherBranch}`, "ADMIN");
      expect(inOtherBranch.body.map((g: { id: string }) => g.id)).toContain(ids.sameNameOtherBranch);
      expect(inOtherBranch.body.map((g: { id: string }) => g.id)).not.toContain(ids.group);
    });

    it("смена филиала на тот, где имя уже занято, — конфликт (GroupsService.update по составному ключу)", async () => {
      const res = await send("patch", `/groups/${ids.group}`, "TEACHER", { branchId: ids.otherBranch });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("groupNameExists");
      // Группа осталась в исходном филиале — конфликт не сломал запись
      const unchanged = await testDb().group.findUnique({ where: { id: ids.group } });
      expect(unchanged?.branchId).toBe(ids.branch);
    });

    it("нулевая цена не принимается: пустое поле не должно обнулять месяц", async () => {
      const res = await send("patch", `/groups/${ids.group}`, "TEACHER", { price: 0 });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("validationFailed");
    });

    // Цена группы обязательна: цена курса в начислениях не участвует, и
    // группа без цены означала бы бесплатное обучение
    it("снять цену группы нельзя: пустая строка — 400, цена на месте", async () => {
      await send("patch", `/groups/${ids.group}`, "TEACHER", { price: 700000 });
      const res = await send("patch", `/groups/${ids.group}`, "TEACHER", { price: "" });
      expect(res.status).toBe(400);
      const unchanged = await testDb().group.findUnique({ where: { id: ids.group } });
      expect(unchanged?.price).toBe(700000);
    });

    it("группу без цены не создать", async () => {
      const res = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `NoPrice-${run}`,
        scheduleDays: [1, 3, 5],
      });
      expect(res.status).toBe(400);
    });

    it("в чужом курсе группу не создать и не изменить", async () => {
      const create = await send("post", "/groups", "TEACHER", {
        courseId: ids.foreign,
        branchId: ids.branch,
        name: "Взлом",
        scheduleDays: [1, 3, 5],
        price: 600000,
      });
      expect(create.status).toBe(404);
      expect((await send("patch", `/groups/${ids.foreignGroup}`, "TEACHER", { name: "Взлом" })).status).toBe(404);
      expect((await send("delete", `/groups/${ids.foreignGroup}`, "TEACHER")).status).toBe(404);
    });

    // Решение владельца 2026-10-09: группу, цену и педагога преподаватель
    // меняет сам, дату окончания тоже, а ставку зарплаты — только администратор
    it("преподаватель не задаёт ставку зарплаты, а цену и дату окончания — может", async () => {
      const withPercent = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `Pct-${run}`,
        scheduleDays: [1, 3, 5],
        price: 600000,
        salaryPercentBp: 10000,
      });
      expect(withPercent.status).toBe(403);
      expect(withPercent.body.message).toBe("salaryPercentAdminOnly");

      const withEnd = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `End-${run}`,
        scheduleDays: [1, 3, 5],
        price: 600000,
        endDate: "2030-01-01",
      });
      expect(withEnd.status).toBe(201);
      expect(new Date(withEnd.body.endDate).toISOString().slice(0, 10)).toBe("2030-01-01");

      // Своя группа: ids.group с ценой 700000 нужна тестам ниже
      const own = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `Money-${run}`,
        scheduleDays: [1, 3, 5],
        price: 600000,
        salaryPercentBp: "",
        endDate: "",
      });
      expect(own.status).toBe(201);
      expect(own.body.salaryPercentBp).toBeNull();
      const groupId = own.body.id;

      // Форма присылает поля как есть: та же ставка и пустая дата — не правка
      const before = await testDb().group.findUniqueOrThrow({ where: { id: groupId } });
      const same = await send("patch", `/groups/${groupId}`, "TEACHER", {
        price: 650000,
        salaryPercentBp: before.salaryPercentBp ?? "",
        endDate: "",
      });
      expect(same.status).toBe(200);
      expect(same.body.price).toBe(650000);

      expect((await send("patch", `/groups/${groupId}`, "TEACHER", { salaryPercentBp: 9000 })).status).toBe(403);
      const setEnd = await send("patch", `/groups/${groupId}`, "TEACHER", { endDate: "2030-01-01" });
      expect(setEnd.status).toBe(200);
      const after = await testDb().group.findUniqueOrThrow({ where: { id: groupId } });
      expect(after.salaryPercentBp).toBe(before.salaryPercentBp);
      expect(after.endDate?.toISOString().slice(0, 10)).toBe("2030-01-01");

      // Администратору можно
      const byAdmin = await send("patch", `/groups/${groupId}`, "ADMIN", { salaryPercentBp: 4000 });
      expect(byAdmin.status).toBe(200);
      expect(byAdmin.body.salaryPercentBp).toBe(4000);

      // Пустое поле — «ставки нет», а не 0 %: z.coerce.number("") давал 0,
      // и группа перебивала ставку преподавателя нулём
      const cleared = await send("patch", `/groups/${groupId}`, "ADMIN", { salaryPercentBp: "" });
      expect(cleared.status).toBe(200);
      expect(cleared.body.salaryPercentBp).toBeNull();
    });

    it("ученик не создаёт и не меняет группы", async () => {
      expect((await send("post", "/groups", "STUDENT", { courseId: ids.own, name: "X" })).status).toBe(403);
      expect((await send("patch", `/groups/${ids.group}`, "STUDENT", { name: "X" })).status).toBe(403);
    });
  });

  describe("состав группы и начисления", () => {
    it("в группу попадают только активные ученики", async () => {
      const student = await createUser({ role: "STUDENT" });
      const inactive = await createUser({ role: "STUDENT", isActive: false });
      const teacherAsStudent = ids.otherTeacher;

      const res = await send("post", `/groups/${ids.group}/students`, "TEACHER", {
        studentIds: [student.id, inactive.id, teacherAsStudent],
      });
      expect(res.status).toBe(201);
      expect(res.body.added).toBe(1);
      ids.student = student.id;
    });

    it("добавление в группу создаёт запись на курс", async () => {
      const enrollment = await testDb().enrollment.findUnique({
        where: { studentId_courseId: { studentId: ids.student, courseId: ids.own } },
      });
      expect(enrollment?.groupId).toBe(ids.group);
    });

    it("перевод в другую группу сначала фиксирует закрытые месяцы", async () => {
      // Запись со старта три месяца назад и цена у группы — есть что замораживать
      await testDb().enrollment.update({
        where: { studentId_courseId: { studentId: ids.student, courseId: ids.own } },
        data: { startsAt: new Date(`${addMonths(current, -3)}-01T12:00:00.000Z`) },
      });
      const second = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `B-${run}`,
        price: 900000,
        scheduleDays: [2, 4],
      });

      const moved = await send("post", `/groups/${second.body.id}/move-student`, "TEACHER", {
        studentId: ids.student,
        courseId: ids.own,
      });
      expect(moved.status).toBe(201);

      const frozen = await testDb().monthlyCharge.findMany({
        where: { enrollmentId: (await enrollmentOf(ids.student, ids.own)).id },
      });
      expect(frozen.length).toBeGreaterThan(0);
      // Прошлое посчитано по цене прежней группы (700000 — её поставил тест
      // «снять цену группы нельзя»), а не по цене новой
      expect(frozen.every((row) => row.priceUsed === 700000)).toBe(true);
      ids.secondGroup = second.body.id;
    });

    it("исключение из группы оставляет запись на курсе", async () => {
      const res = await send("delete", `/groups/${ids.secondGroup}/students/${ids.student}`, "TEACHER");
      expect(res.status).toBe(200);
      const enrollment = await enrollmentOf(ids.student, ids.own);
      expect(enrollment.groupId).toBeNull();
    });

    it("с отчислением без истории запись удаляется", async () => {
      const student = await createUser({ role: "STUDENT" });
      await send("post", `/groups/${ids.group}/students`, "TEACHER", { studentIds: [student.id] });
      const res = await send(
        "delete",
        `/groups/${ids.group}/students/${student.id}?alsoUnenroll=true`,
        "TEACHER"
      );
      expect(res.status).toBe(200);
      expect(
        await testDb().enrollment.count({ where: { studentId: student.id, courseId: ids.own } })
      ).toBe(0);
    });

    // Решение владельца 2026-09-23: группу с учениками не удаляем, а
    // закрываем — иначе ученики теряли цену группы и текущий месяц
    it("группа с учениками не удаляется, а закрывается: ученики и цена на месте", async () => {
      const student = await createUser({ role: "STUDENT" });
      await send("post", `/groups/${ids.group}/students`, "TEACHER", { studentIds: [student.id] });

      // Закрытие останавливает начисления — только администратор (решение
      // владельца 2026-10-09); преподавателю — 403, группа не тронута
      const byTeacher = await send("delete", `/groups/${ids.group}`, "TEACHER");
      expect(byTeacher.status).toBe(403);
      expect((await testDb().group.findUnique({ where: { id: ids.group } }))?.isActive).toBe(true);

      const res = await send("delete", `/groups/${ids.group}`, "ADMIN");
      expect(res.status).toBe(200);
      expect(res.body.closed).toBe(true);

      const enrollment = await enrollmentOf(student.id, ids.own);
      expect(enrollment.groupId).toBe(ids.group);
      const closed = await testDb().group.findUnique({ where: { id: ids.group } });
      expect(closed?.isActive).toBe(false);
      expect(closed?.endDate).not.toBeNull();
      expect(closed?.price).not.toBeNull();
    });

    it("пустая группа без истории удаляется физически", async () => {
      const created = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.branch,
        name: `Empty-${run}`,
        scheduleDays: [1, 3, 5],
        price: 600000,
      });
      expect(created.status).toBe(201);
      const res = await send("delete", `/groups/${created.body.id}`, "TEACHER");
      expect(res.status).toBe(200);
      expect(res.body.closed).toBe(false);
      expect(await testDb().group.count({ where: { id: created.body.id } })).toBe(0);
    });
  });

  describe("сводка по группе", () => {
    it("считается и доступна персоналу", async () => {
      const res = await get(`/groups/${ids.secondGroup}/statistics`, "TEACHER");
      expect(res.status).toBe(200);
      expect(res.body.summary).toHaveProperty("avgAttendance");
      expect((await get(`/groups/${ids.secondGroup}/statistics`, "STUDENT")).status).toBe(403);
    });

    it("несуществующая группа — 404", async () => {
      expect((await get("/groups/no-such-group/statistics", "ADMIN")).status).toBe(404);
    });
  });

  describe("отчисление с историей и повторная запись", () => {
    // Свой курс и своя группа — не переиспользуют ids.own/ids.group: те к
    // этому месту уже накопили состояние от прежних тестов (в т.ч. записи
    // без группы), а здесь важно считать только своих учеников
    let courseId: string;
    let groupId: string;

    beforeAll(async () => {
      const course = await testDb().course.create({
        data: {
          slug: `g-history-${run}`,
          title: "История отчисления",
          teacherId: ids.TEACHER,
          price: 600000,
          isPublished: true,
        },
      });
      courseId = course.id;
      const group = await testDb().group.create({
        data: { price: 600000, name: `H-${run}`, courseId, branchId: ids.branch, scheduleDays: [1, 3, 5] },
      });
      groupId = group.id;
    });

    it("с отчислением при наличии истории запись остаётся: MonthlyCharge цел, долг посчитан верно", async () => {
      const student = await createUser({ role: "STUDENT" });
      await send("post", `/groups/${groupId}/students`, "TEACHER", { studentIds: [student.id] });
      // Учёба началась три месяца назад — есть что заморозить и с чего набежать долгу
      await testDb().enrollment.update({
        where: { studentId_courseId: { studentId: student.id, courseId } },
        data: { startsAt: new Date(`${addMonths(current, -3)}-01T12:00:00.000Z`) },
      });

      const res = await send(
        "delete",
        `/groups/${groupId}/students/${student.id}?alsoUnenroll=true`,
        "TEACHER"
      );
      expect(res.status).toBe(200);

      const enrollment = await enrollmentOf(student.id, courseId);
      // Запись жива, группа снята, дата отчисления и unenrolledAt проставлены
      expect(enrollment).not.toBeNull();
      expect(enrollment.groupId).toBeNull();
      expect(enrollment.billingEndsAt).not.toBeNull();
      expect(enrollment.unenrolledAt).not.toBeNull();

      // MonthlyCharge за закрытые месяцы уцелели — не унесло каскадом вместе с записью
      const charges = await testDb().monthlyCharge.findMany({ where: { enrollmentId: enrollment.id } });
      expect(charges.length).toBeGreaterThan(0);

      // Карточка студента видит запись и её billingEndsAt (история доступна)
      const billing = await get(`/billing/students/${student.id}`, "ADMIN");
      expect(billing.status).toBe(200);
      const course = billing.body.courses.find((c: { course: { id: string } }) => c.course.id === courseId);
      expect(course).toBeDefined();
      expect(course.billingEndsAt).not.toBeNull();
      expect(course.totalCharged).toBeGreaterThan(0);

      // Начисления дальше не растут: месяц ПОСЛЕ отчисления — ноль, хотя до
      // самой даты отчисления (включая её неполный месяц) сумма положительна
      const ledger = app.get(BillingLedgerService);
      const nextMonth = addMonths(current, 1);
      const loaded = await ledger.loadBillableEnrollments({ enrollmentId: enrollment.id });
      const schedule = (await ledger.resolveSchedules(loaded, nextMonth)).get(enrollment.id) ?? [];
      const afterEnd = schedule.find((item) => item.month === nextMonth);
      expect(afterEnd?.charge.amount ?? 0).toBe(0);
      const total = schedule.reduce((sum, item) => sum + item.charge.amount, 0);
      expect(total).toBeGreaterThanOrEqual(charges.reduce((sum, row) => sum + row.amount, 0));
    });

    it("повторная запись после отчисления возобновляет ту же строку, а не упирается в уникальность", async () => {
      const student = await createUser({ role: "STUDENT" });
      await send("post", `/groups/${groupId}/students`, "TEACHER", { studentIds: [student.id] });
      await testDb().enrollment.update({
        where: { studentId_courseId: { studentId: student.id, courseId } },
        data: { startsAt: new Date(`${addMonths(current, -3)}-01T12:00:00.000Z`) },
      });
      const before = await enrollmentOf(student.id, courseId);

      await send("delete", `/groups/${groupId}/students/${student.id}?alsoUnenroll=true`, "TEACHER");
      const finished = await enrollmentOf(student.id, courseId);
      expect(finished.billingEndsAt).not.toBeNull();
      expect(finished.unenrolledAt).not.toBeNull();

      const res = await send("post", `/groups/${groupId}/students`, "TEACHER", {
        studentIds: [student.id],
      });
      expect(res.status).toBe(201);
      expect(res.body.added).toBe(1);

      const revived = await enrollmentOf(student.id, courseId);
      // Та же строка, не вторая: уникальность (studentId, courseId) её и не пустила бы
      expect(revived.id).toBe(before.id);
      expect(revived.groupId).toBe(groupId);
      expect(revived.billingEndsAt).toBeNull();
      expect(revived.unenrolledAt).toBeNull();
    });

    // Правка «возвращённого ученика списывают за весь текущий месяц»: снятие
    // только billingEndsAt/unenrolledAt возвращало старую startsAt (от
    // прошлого обучения), и текущий месяц насчитывался ПОЛНОСТЬЮ (basis
    // "full"), хотя ученик вернулся не 1-го числа. Теперь addStudents
    // переносит startsAt на сегодня и сбрасывает firstMonthCharge.
    it("возврат в группу переносит startsAt на сегодня: старые заморозки целы, текущий месяц не насчитан полностью", async () => {
      const student = await createUser({ role: "STUDENT" });
      await send("post", `/groups/${groupId}/students`, "TEACHER", { studentIds: [student.id] });
      await testDb().enrollment.update({
        where: { studentId_courseId: { studentId: student.id, courseId } },
        data: { startsAt: new Date(`${addMonths(current, -3)}-01T12:00:00.000Z`) },
      });

      // Отчислен в ПРОШЛОМ (уже закрытом) месяце — не сегодня, как обычный
      // removeStudent: иначе нечего было бы замораживать до возврата
      const prevMonthEnd = new Date(`${addMonths(current, -1)}-15T12:00:00.000Z`);
      await testDb().enrollment.update({
        where: { studentId_courseId: { studentId: student.id, courseId } },
        data: { groupId: null, billingEndsAt: prevMonthEnd, unenrolledAt: prevMonthEnd },
      });

      const ledger = app.get(BillingLedgerService);
      await ledger.freezeClosedMonths({ studentId: student.id, courseId });

      const before = await enrollmentOf(student.id, courseId);
      const chargesBefore = await testDb().monthlyCharge.findMany({
        where: { enrollmentId: before.id },
        orderBy: { month: "asc" },
      });
      expect(chargesBefore.length).toBeGreaterThan(0);
      expect(chargesBefore.every((row) => row.lockedAt !== null)).toBe(true);

      const res = await send("post", `/groups/${groupId}/students`, "TEACHER", {
        studentIds: [student.id],
      });
      expect(res.status).toBe(201);
      expect(res.body.added).toBe(1);

      const after = await enrollmentOf(student.id, courseId);
      expect(after.groupId).toBe(groupId);
      expect(after.billingEndsAt).toBeNull();
      expect(after.unenrolledAt).toBeNull();
      // Ручная сумма первого месяца относилась к прошлому обучению
      expect(after.firstMonthCharge).toBeNull();
      // startsAt — сегодня (сравниваем календарную дату, не время)
      expect(new Date(after.startsAt as Date).toISOString().slice(0, 10)).toBe(
        new Date().toISOString().slice(0, 10)
      );

      // Замороженные месяцы прошлого обучения не пострадали от того, что
      // startsAt теперь позже них — mergeSchedule берёт их из реестра как есть
      const chargesAfter = await testDb().monthlyCharge.findMany({
        where: { enrollmentId: after.id },
        orderBy: { month: "asc" },
      });
      expect(chargesAfter).toEqual(chargesBefore);

      // Текущий месяц — сравниваем с chargeForMonth по той же (уже
      // обновлённой) записи, а не с зашитым числом: тест переживёт любой
      // день месяца, в который его прогонят.
      const loaded = await ledger.loadBillableEnrollments({ enrollmentId: after.id });
      const billing = ledger.toBillingEnrollment(loaded[0]);
      const expectedCurrent = chargeForMonth(billing, current);
      const schedule = (await ledger.resolveSchedules(loaded, current)).get(after.id) ?? [];
      const currentRow = schedule.find((item) => item.month === current);
      expect(currentRow?.charge.amount ?? 0).toBe(expectedCurrent.amount);

      // Не первое число — значит, startsAt строго позже начала месяца, и
      // формула не может дать basis "full" (целиком за месяц независимо от
      // расписания); она обязана перейти на расчёт по занятиям/дням
      if (new Date().getUTCDate() > 1) {
        expect(expectedCurrent.basis).not.toBe("full");
      }
    });

    it("снятие с группы без отчисления + отдельная пауза billingEndsAt не отбирают доступ", async () => {
      // Сценарий из ревью: сняли с группы (ждёт новую — активное состояние),
      // отдельно поставили дату отчисления только для паузы в начислениях —
      // это НЕ отчисление, unenrolledAt не должен проставляться
      const student = await createUser({ role: "STUDENT" });
      await send("post", `/groups/${groupId}/students`, "TEACHER", { studentIds: [student.id] });
      await send("delete", `/groups/${groupId}/students/${student.id}`, "TEACHER");

      const ungrouped = await enrollmentOf(student.id, courseId);
      expect(ungrouped.groupId).toBeNull();
      expect(ungrouped.unenrolledAt).toBeNull();

      const paused = await send("patch", `/billing/enrollments/${ungrouped.id}`, "ADMIN", {
        billingEndsAt: `${current}-01`,
      });
      expect(paused.status).toBe(200);

      const row = await enrollmentOf(student.id, courseId);
      expect(row.billingEndsAt).not.toBeNull();
      // Пауза — не отчисление: unenrolledAt остаётся пустым
      expect(row.unenrolledAt).toBeNull();

      // Доступ к курсу цел — CASL смотрит на unenrolledAt, а не на связку
      // groupId+billingEndsAt
      const studentCookie = await sessionCookie(student, { roleInToken: "STUDENT" });
      const access = await http().get(`/api/v2/courses/${courseId}`).set("Cookie", studentCookie);
      expect(access.status).toBe(200);
    });
  });

  async function enrollmentOf(studentId: string, courseId: string) {
    const enrollment = await testDb().enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) throw new Error("нет записи на курс");
    return enrollment;
  }
});
