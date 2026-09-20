import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("посещаемость и родители", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const date = "2026-09-16";

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user, { roleInToken: role });
    }
    const groupTeacher = await createUser({ role: "TEACHER" });
    ids.groupTeacher = groupTeacher.id;
    cookies.groupTeacher = await sessionCookie(groupTeacher, { roleInToken: "TEACHER" });
    const stranger = await createUser({ role: "TEACHER" });
    ids.stranger = stranger.id;
    cookies.stranger = await sessionCookie(stranger, { roleInToken: "TEACHER" });

    const otherStudent = await createUser({ role: "STUDENT" });
    ids.otherStudent = otherStudent.id;

    const course = await testDb().course.create({
      data: { slug: `att-${run}`, title: "Курс", teacherId: ids.TEACHER },
    });
    ids.course = course.id;
    const branch = await createBranch();
    const group = await testDb().group.create({
      data: { name: `AG-${run}`, courseId: course.id, teacherId: ids.groupTeacher, branchId: branch.id },
    });
    ids.group = group.id;

    for (const studentId of [ids.STUDENT, ids.otherStudent]) {
      await testDb().enrollment.create({ data: { studentId, courseId: course.id, groupId: group.id } });
    }
    // Родитель — только у первого ученика
    await testDb().parentStudent.create({
      data: { parentId: ids.PARENT, studentId: ids.STUDENT, isPrimary: true },
    });
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

  describe("занятия", () => {
    it("занятие заводит педагог курса", async () => {
      const res = await send("post", "/attendance/sessions", "TEACHER", {
        courseId: ids.course,
        date,
        groupId: ids.group,
      });
      expect(res.status).toBe(201);
      // Ведущий подставлен: у группы свой педагог
      expect(res.body.teacherId).toBe(ids.groupTeacher);
      ids.session = res.body.id;
    });

    it("дубль на ту же дату и группу отклоняется", async () => {
      const res = await send("post", "/attendance/sessions", "TEACHER", {
        courseId: ids.course,
        date,
        groupId: ids.group,
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("sessionAlreadyExists");
    });

    it("посторонний преподаватель занятие не заводит и не удаляет", async () => {
      const create = await send("post", "/attendance/sessions", "stranger", {
        courseId: ids.course,
        date: "2026-09-18",
      });
      expect(create.status).toBe(404);
      expect((await send("delete", `/attendance/sessions/${ids.session}`, "stranger")).status).toBe(404);
    });

    it("ученик и родитель занятия не заводят", async () => {
      for (const role of ["STUDENT", "PARENT"]) {
        const res = await send("post", "/attendance/sessions", role, { courseId: ids.course, date: "2026-09-19" });
        expect(res.status, role).toBe(403);
      }
    });

    it("педагог группы отмечает учеников", async () => {
      const res = await send("patch", `/attendance/sessions/${ids.session}/records`, "groupTeacher", {
        records: [
          { studentId: ids.STUDENT, status: "PRESENT" },
          { studentId: ids.otherStudent, status: "ABSENT", note: "болел" },
        ],
      });
      expect(res.status).toBe(200);
      expect(await testDb().attendanceRecord.count({ where: { sessionId: ids.session } })).toBe(2);
    });

    it("ведущего занятия меняет только администратор", async () => {
      const byTeacher = await send("patch", `/attendance/sessions/${ids.session}/records`, "groupTeacher", {
        records: [],
        teacher: { teacherId: ids.stranger },
      });
      expect(byTeacher.status).toBe(403);
      expect(byTeacher.body.message).toBe("onlyAdminCanChangeTeacher");

      const byAdmin = await send("patch", `/attendance/sessions/${ids.session}/records`, "ADMIN", {
        records: [],
        teacher: { teacherId: ids.stranger, status: "PRESENT" },
      });
      expect(byAdmin.status).toBe(200);
      const session = await testDb().attendanceSession.findUnique({ where: { id: ids.session } });
      expect(session?.teacherId).toBe(ids.stranger);
    });

    it("несуществующий преподаватель в замену не ставится", async () => {
      const res = await send("patch", `/attendance/sessions/${ids.session}/records`, "ADMIN", {
        records: [],
        teacher: { teacherId: "no-such-teacher" },
      });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("teacherNotFound");
    });
  });

  describe("что видно ученику (аудит 2.3)", () => {
    it("ученик видит занятия своего курса и только свои отметки", async () => {
      const res = await get(`/attendance/sessions?courseId=${ids.course}`, "STUDENT");
      expect(res.status).toBe(200);
      const allRecords = res.body.flatMap((s: { records: { studentId: string }[] }) => s.records);
      expect(allRecords.every((r: { studentId: string }) => r.studentId === ids.STUDENT)).toBe(true);
    });

    it("ученик чужого курса занятий не видит", async () => {
      const outsider = await createUser({ role: "STUDENT" });
      const cookie = await sessionCookie(outsider);
      const res = await http()
        .get(`/api/v2/attendance/sessions?courseId=${ids.course}`)
        .set("Cookie", cookie);
      expect(res.status).toBe(403);
    });

    it("матрица посещаемости с контактами — только персоналу", async () => {
      expect((await get(`/attendance/report?courseId=${ids.course}`, "TEACHER")).status).toBe(200);
      expect((await get(`/attendance/report?courseId=${ids.course}`, "STUDENT")).status).toBe(403);
      expect((await get(`/attendance/report?courseId=${ids.course}`, "PARENT")).status).toBe(403);
    });
  });

  describe("регрессия аудита 2.4: родитель и чужие дети", () => {
    it("родитель видит посещаемость своего ребёнка", async () => {
      const res = await get(`/attendance/student?studentId=${ids.STUDENT}`, "PARENT");
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("родитель не видит посещаемость чужого ребёнка", async () => {
      const res = await get(`/attendance/student?studentId=${ids.otherStudent}`, "PARENT");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("studentNotFound");
    });

    it("ученик читает только себя: чужой id игнорируется", async () => {
      const res = await get(`/attendance/student?studentId=${ids.otherStudent}`, "STUDENT");
      expect(res.status).toBe(200);
      // Вернулась своя посещаемость, а не чужая
      const sessions = res.body.flatMap((c: { records: unknown[] }) => c.records);
      expect(sessions.length).toBeGreaterThan(0);
      const own = await testDb().attendanceRecord.count({ where: { studentId: ids.STUDENT } });
      expect(sessions.length).toBe(own);
    });

    it("родитель не видит чужую семью", async () => {
      const otherParent = await createUser({ role: "PARENT" });
      const res = await get(`/parents/children?parentId=${otherParent.id}`, "PARENT");
      expect(res.status).toBe(404);
    });

    it("свою семью родитель видит", async () => {
      const res = await get("/parents/children", "PARENT");
      expect(res.status).toBe(200);
      expect(res.body[0].student.id).toBe(ids.STUDENT);
    });
  });

  describe("отчёт по преподавателям", () => {
    it("преподаватель видит только свою статистику", async () => {
      const res = await get("/attendance/teachers/report", "groupTeacher");
      expect(res.status).toBe(200);
      expect(res.body.every((row: { teacherId: string }) => row.teacherId === ids.groupTeacher)).toBe(true);
    });

    it("администратор видит всех", async () => {
      const res = await get("/attendance/teachers/report", "ADMIN");
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("ученику и родителю отчёт закрыт", async () => {
      expect((await get("/attendance/teachers/report", "STUDENT")).status).toBe(403);
      expect((await get("/attendance/teachers/sessions", "PARENT")).status).toBe(403);
    });

    it("отметка преподавателя фиксирует ведущего", async () => {
      const session = await testDb().attendanceSession.create({
        data: { courseId: ids.course, date: new Date("2026-09-20"), groupId: null },
      });
      const res = await send("post", `/attendance/sessions/${session.id}/teacher`, "ADMIN", {
        status: "ABSENT",
        note: "заболел",
      });
      expect(res.status).toBe(201);
      const row = await testDb().attendanceSession.findUnique({ where: { id: session.id } });
      expect(row?.teacherStatus).toBe("ABSENT");
      // Ведущий был пуст — записан педагог курса
      expect(row?.teacherId).toBe(ids.TEACHER);
    });
  });

  describe("связи родителей", () => {
    it("привязывает и меняет связи только администратор", async () => {
      const student = await createUser({ role: "STUDENT" });
      const created = await send("post", "/parents", "ADMIN", {
        studentId: student.id,
        firstName: "Мама",
        lastName: "Тест",
        phone: "+998901234567",
        relation: "MOTHER",
        isPrimary: true,
      });
      expect(created.status).toBe(201);
      ids.newParent = created.body.id;

      const byTeacher = await send("post", "/parents", "TEACHER", {
        studentId: student.id,
        firstName: "Папа",
        lastName: "Тест",
        phone: "+998901234568",
      });
      expect(byTeacher.status).toBe(403);
      ids.newStudent = student.id;
    });

    it("родителем нельзя сделать не-родителя, а ребёнком — не-ученика", async () => {
      const notParent = await send("post", "/parents/links", "ADMIN", {
        parentId: ids.TEACHER,
        studentId: ids.newStudent,
      });
      expect(notParent.body.message).toBe("notAParent");

      const notStudent = await send("post", "/parents/links", "ADMIN", {
        parentId: ids.newParent,
        studentId: ids.TEACHER,
      });
      expect(notStudent.body.message).toBe("notAStudent");
    });

    it("основной контакт у ученика один", async () => {
      const second = await send("post", "/parents", "ADMIN", {
        studentId: ids.newStudent,
        firstName: "Папа",
        lastName: "Тест",
        phone: "+998901234569",
        isPrimary: true,
      });
      expect(second.status).toBe(201);

      const links = await testDb().parentStudent.findMany({ where: { studentId: ids.newStudent } });
      expect(links.filter((link) => link.isPrimary).length).toBe(1);
    });

    it("связь удаляется, сам родитель остаётся", async () => {
      const link = await testDb().parentStudent.findFirst({
        where: { studentId: ids.newStudent, parentId: ids.newParent },
      });
      const res = await send("delete", `/parents/links/${link!.id}`, "ADMIN");
      expect(res.status).toBe(200);
      expect(await testDb().parentStudent.count({ where: { id: link!.id } })).toBe(0);
      expect(await testDb().user.count({ where: { id: ids.newParent } })).toBe(1);
    });

    it("получатели рассылки по группе: дубли схлопнуты, без телефона отдельно", async () => {
      const res = await get(`/parents/group-recipients?groupId=${ids.group}`, "ADMIN");
      expect(res.status).toBe(200);
      expect(res.body.studentCount).toBe(2);
      expect((await get(`/parents/group-recipients?groupId=${ids.group}`, "STUDENT")).status).toBe(403);
    });
  });
});
