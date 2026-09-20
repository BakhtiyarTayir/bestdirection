import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingLedgerService } from "../src/modules/billing/billing-ledger.service";
import { addMonths, monthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("модуль groups", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const current = monthKey(new Date());

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
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("groupNameExists");
    });

    it("то же имя в другом филиале — не конфликт", async () => {
      const res = await send("post", "/groups", "TEACHER", {
        courseId: ids.own,
        branchId: ids.otherBranch,
        name: `A-${run}`,
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

    it("пустая строка в цене убирает цену группы", async () => {
      await send("patch", `/groups/${ids.group}`, "TEACHER", { price: 700000 });
      const res = await send("patch", `/groups/${ids.group}`, "TEACHER", { price: "" });
      expect(res.status).toBe(200);
      expect(res.body.price).toBeNull();
    });

    it("в чужом курсе группу не создать и не изменить", async () => {
      const create = await send("post", "/groups", "TEACHER", {
        courseId: ids.foreign,
        branchId: ids.branch,
        name: "Взлом",
      });
      expect(create.status).toBe(404);
      expect((await send("patch", `/groups/${ids.foreignGroup}`, "TEACHER", { name: "Взлом" })).status).toBe(404);
      expect((await send("delete", `/groups/${ids.foreignGroup}`, "TEACHER")).status).toBe(404);
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
      // Запись со старта три месяца назад и цена у курса — есть что замораживать
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
      // Прошлое посчитано по цене курса, а не по цене новой группы
      expect(frozen.every((row) => row.priceUsed === 600000)).toBe(true);
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

    it("удаление группы снимает её с записей, но не удаляет их", async () => {
      const student = await createUser({ role: "STUDENT" });
      await send("post", `/groups/${ids.group}/students`, "TEACHER", { studentIds: [student.id] });

      const res = await send("delete", `/groups/${ids.group}`, "TEACHER");
      expect(res.status).toBe(200);

      const enrollment = await enrollmentOf(student.id, ids.own);
      expect(enrollment.groupId).toBeNull();
      expect(await testDb().group.count({ where: { id: ids.group } })).toBe(0);
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
        data: { name: `H-${run}`, courseId, branchId: ids.branch, scheduleDays: [1, 3, 5] },
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
