import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, monthKey } from "../src/modules/billing/domain/billing";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

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

    const foreignGroup = await testDb().group.create({
      data: { name: `FG-${run}`, courseId: foreign.id },
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
        name: `A-${run}`,
        scheduleDays: [1, 3, 5],
      });
      expect(res.status).toBe(201);
      expect(res.body.teacherId).toBe(ids.TEACHER);
      ids.group = res.body.id;
    });

    it("имя внутри курса уникально", async () => {
      const res = await send("post", "/groups", "TEACHER", { courseId: ids.own, name: `A-${run}` });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("groupNameExists");
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
      const create = await send("post", "/groups", "TEACHER", { courseId: ids.foreign, name: "Взлом" });
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

    it("с отчислением запись исчезает", async () => {
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

  async function enrollmentOf(studentId: string, courseId: string) {
    const enrollment = await testDb().enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) throw new Error("нет записи на курс");
    return enrollment;
  }
});
