import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toNoonUtc } from "../src/common/date-only";
import { currentDateKey, currentMonthKey, isoWeekday } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

// Журнал посещаемости по группам (план 2026-09-24): у каждой группы свой
// журнал, а не общая таблица курса. Проверяем ровно то, что описано в плане,
// раздел 1 «Тесты»: обязательность группы при создании занятия, привязку
// группы к курсу, фильтр sessions?groupId=, доступ преподавателя по лестнице
// «педагог группы → педагог курса» и подсчёт «отмечено N из M» в /attendance/groups.
describe("журнал посещаемости по группам", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  // Та же функция, что использует сервис — тест не должен разъехаться с ним
  // в окне 19:00–24:00 UTC, когда в Ташкенте уже другой день
  const todayKey = currentDateKey();
  const todayDate = toNoonUtc(todayKey);
  const todayWeekday = isoWeekday(todayDate);
  const month = currentMonthKey();
  const monthStartDate = new Date(`${month}-01T12:00:00.000Z`);

  beforeAll(async () => {
    app = await createTestApp();
    const courseTeacher = await createUser({ role: "TEACHER" });
    ids.courseTeacher = courseTeacher.id;
    cookies.courseTeacher = await sessionCookie(courseTeacher);

    const groupTeacher1 = await createUser({ role: "TEACHER" });
    ids.groupTeacher1 = groupTeacher1.id;
    cookies.groupTeacher1 = await sessionCookie(groupTeacher1);

    const groupTeacher2 = await createUser({ role: "TEACHER" });
    ids.groupTeacher2 = groupTeacher2.id;
    cookies.groupTeacher2 = await sessionCookie(groupTeacher2);

    const admin = await createUser({ role: "ADMIN" });
    ids.admin = admin.id;
    cookies.admin = await sessionCookie(admin);

    const student = await createUser({ role: "STUDENT" });
    ids.student = student.id;
    cookies.student = await sessionCookie(student);

    const branch = await createBranch(`Журнал-групп-${run}`);
    ids.branch = branch.id;

    const course = await testDb().course.create({
      data: { slug: `att-groups-${run}`, title: "Курс с группами", teacherId: ids.courseTeacher },
    });
    ids.course = course.id;

    // Группа с расписанием сегодняшнего дня — для проверки «отмечено N из M»
    const group1 = await testDb().group.create({
      data: {
        name: `Группа-1-${run}`,
        courseId: course.id,
        branchId: branch.id,
        teacherId: ids.groupTeacher1,
        scheduleDays: [todayWeekday],
        startDate: monthStartDate,
      },
    });
    ids.group1 = group1.id;

    const group2 = await testDb().group.create({
      data: { name: `Группа-2-${run}`, courseId: course.id, branchId: branch.id, teacherId: ids.groupTeacher2 },
    });
    ids.group2 = group2.id;

    await testDb().enrollment.create({ data: { studentId: student.id, courseId: course.id, groupId: group1.id } });

    // Второй курс с собственной группой — «группа чужого курса» в тестах ниже
    const otherCourse = await testDb().course.create({
      data: { slug: `att-groups-other-${run}`, title: "Другой курс", teacherId: ids.courseTeacher },
    });
    ids.otherCourse = otherCourse.id;
    const otherGroup = await testDb().group.create({
      data: { name: `Чужая группа-${run}`, courseId: otherCourse.id, branchId: branch.id },
    });
    ids.otherGroup = otherGroup.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const get = (path: string, role: string) =>
    http().get(`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL);
  const post = (path: string, role: string, body?: object) =>
    http().post(`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL).send(body);

  describe("POST /attendance/sessions", () => {
    it("занятие без группы у курса с группами — 400", async () => {
      const res = await post("/attendance/sessions", "courseTeacher", {
        courseId: ids.course,
        date: "2026-09-10",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("groupRequired");
    });

    it("группа чужого курса — 400", async () => {
      const res = await post("/attendance/sessions", "courseTeacher", {
        courseId: ids.course,
        date: "2026-09-10",
        groupId: ids.otherGroup,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("groupNotInCourse");
    });

    it("своя группа своего курса — создаётся", async () => {
      const res = await post("/attendance/sessions", "groupTeacher1", {
        courseId: ids.course,
        date: "2026-09-11",
        groupId: ids.group1,
      });
      expect(res.status).toBe(201);
      ids.session1 = res.body.id;

      const res2 = await post("/attendance/sessions", "groupTeacher2", {
        courseId: ids.course,
        date: "2026-09-11",
        groupId: ids.group2,
      });
      expect(res2.status).toBe(201);
      ids.session2 = res2.body.id;
    });
  });

  describe("GET /attendance/sessions?groupId=", () => {
    it("отдаёт только занятия своей группы", async () => {
      const res = await get(`/attendance/sessions?courseId=${ids.course}&groupId=${ids.group1}`, "admin");
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((session: { groupId: string | null }) => session.groupId === ids.group1)).toBe(true);
    });

    it("преподаватель другой группы этого же курса — 404", async () => {
      // groupTeacher2 не ведёт group1 и не педагог курса — доступ к её
      // журналу закрыт (лестница «педагог группы → педагог курса»)
      const res = await get(`/attendance/sessions?courseId=${ids.course}&groupId=${ids.group1}`, "groupTeacher2");
      expect(res.status).toBe(404);
    });

    it("педагог курса видит журнал любой его группы", async () => {
      const res = await get(`/attendance/sessions?courseId=${ids.course}&groupId=${ids.group2}`, "courseTeacher");
      expect(res.status).toBe(200);
    });

    it("ученик не своей группы курса — 403", async () => {
      // student записан в group1, а не в group2
      const res = await get(`/attendance/sessions?courseId=${ids.course}&groupId=${ids.group2}`, "student");
      expect(res.status).toBe(403);
    });

    it("ученик своей группы видит только свои отметки", async () => {
      const res = await get(`/attendance/sessions?courseId=${ids.course}&groupId=${ids.group1}`, "student");
      expect(res.status).toBe(200);
      const allRecords = res.body.flatMap((s: { records: { studentId: string }[] }) => s.records);
      expect(allRecords.every((r: { studentId: string }) => r.studentId === ids.student)).toBe(true);
    });
  });

  describe("GET /attendance/groups", () => {
    it("список групп считает «отмечено N из M»", async () => {
      const before = await get(`/attendance/groups?branchId=${ids.branch}`, "admin");
      expect(before.status).toBe(200);
      const row1Before = before.body.find((g: { groupId: string }) => g.groupId === ids.group1);
      expect(row1Before).toBeTruthy();
      // Сегодняшний день недели — в расписании группы, поэтому план в этом
      // месяце как минимум 1: занятие уже прошло (за 2026-09-11), но оно вне
      // текущего месяца-фильтра по умолчанию, если запускать не в сентябре —
      // считаем через план сервиса, а не заранее вручную
      expect(row1Before.plannedLessons).toBeGreaterThanOrEqual(1);
      const markedBefore = row1Before.markedLessons;

      await testDb().attendanceSession.create({
        data: { courseId: ids.course, groupId: ids.group1, date: todayDate },
      });

      const after = await get(`/attendance/groups?branchId=${ids.branch}`, "admin");
      const row1After = after.body.find((g: { groupId: string }) => g.groupId === ids.group1);
      expect(row1After.markedLessons).toBe(markedBefore + 1);
      expect(row1After.lastSessionDate).toBeTruthy();
    });

    it("преподавателю — только свои группы", async () => {
      const res = await get(`/attendance/groups?branchId=${ids.branch}`, "groupTeacher1");
      expect(res.status).toBe(200);
      const groupIds = res.body.map((g: { groupId: string }) => g.groupId);
      expect(groupIds).toContain(ids.group1);
      expect(groupIds).not.toContain(ids.group2);
    });

    it("педагог курса видит все группы курса", async () => {
      const res = await get(`/attendance/groups?branchId=${ids.branch}`, "courseTeacher");
      const groupIds = res.body.map((g: { groupId: string }) => g.groupId);
      expect(groupIds).toContain(ids.group1);
      expect(groupIds).toContain(ids.group2);
    });

    it("ученику список закрыт", async () => {
      expect((await get("/attendance/groups", "student")).status).toBe(403);
    });

    it("groupId сужает список до одной группы — сводка для шапки журнала", async () => {
      const res = await get(`/attendance/groups?groupId=${ids.group1}`, "admin");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].groupId).toBe(ids.group1);
    });
  });
});
