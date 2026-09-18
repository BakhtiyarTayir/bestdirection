import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("заявки на курсы, копирование и Корзина", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);

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

    const free = await testDb().course.create({
      data: { slug: `free-${run}`, title: "Бесплатный", teacherId: ids.TEACHER, isPublished: true, accessType: "FREE" },
    });
    ids.free = free.id;
    const paid = await testDb().course.create({
      data: { slug: `paid-${run}`, title: "Платный", teacherId: ids.TEACHER, isPublished: true, accessType: "PAID" },
    });
    ids.paid = paid.id;
    const closed = await testDb().course.create({
      data: { slug: `closed-${run}`, title: "Закрытый", teacherId: ids.TEACHER, isPublished: true, accessType: "CLOSED" },
    });
    ids.closed = closed.id;
    const seatsOnly = await testDb().course.create({
      data: {
        slug: `seats-${run}`,
        title: "Одно место",
        teacherId: ids.TEACHER,
        isPublished: true,
        accessType: "FREE",
        intakeSeats: 1,
      },
    });
    ids.seatsOnly = seatsOnly.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const get = (path: string, role?: string) => {
    const req = http().get(`/api/v2${path}`);
    return role ? req.set("Cookie", cookies[role]) : req;
  };
  const post = (path: string, role: string, body?: object) =>
    http().post(`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL).send(body);

  describe("каталог и самозапись", () => {
    it("каталог — ученику; преподавателю и родителю закрыт", async () => {
      expect((await get("/enrollment-requests/catalog", "STUDENT")).status).toBe(200);
      for (const role of ["TEACHER", "PARENT"]) {
        expect((await get("/enrollment-requests/catalog", role)).status, role).toBe(403);
      }
      // Администратору открыто всё: у него manage all, отдельного запрета нет
      expect((await get("/enrollment-requests/catalog", "ADMIN")).status).toBe(200);
    });

    it("в каталоге только курсы с самозаписью", async () => {
      const res = await get("/enrollment-requests/catalog", "STUDENT");
      const listed = res.body.map((c: { id: string }) => c.id);
      expect(listed).toEqual(expect.arrayContaining([ids.free, ids.paid]));
      expect(listed).not.toContain(ids.closed);
    });

    it("на бесплатный курс ученик записывается сам, повторно — нельзя", async () => {
      const first = await post("/enrollment-requests/free-enroll", "STUDENT", { courseId: ids.free });
      expect(first.status).toBe(201);
      expect(first.body.courseSlug).toBe(`free-${run}`);

      const second = await post("/enrollment-requests/free-enroll", "STUDENT", { courseId: ids.free });
      expect(second.status).toBe(409);
      expect(second.body.message).toBe("alreadyEnrolled");
    });

    it("на платный курс самозаписи нет — только заявка", async () => {
      const res = await post("/enrollment-requests/free-enroll", "STUDENT", { courseId: ids.paid });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("courseNotAvailable");
    });

    it("места кончились — запись не проходит", async () => {
      const lucky = await createUser({ role: "STUDENT" });
      const luckyCookie = await sessionCookie(lucky);
      const taken = await http()
        .post("/api/v2/enrollment-requests/free-enroll")
        .set("Cookie", luckyCookie)
        .set("Origin", TEST_APP_URL)
        .send({ courseId: ids.seatsOnly });
      expect(taken.status).toBe(201);

      const late = await post("/enrollment-requests/free-enroll", "STUDENT", { courseId: ids.seatsOnly });
      expect(late.status).toBe(409);
      expect(late.body.message).toBe("noSeatsLeft");
    });
  });

  describe("заявка и её рассмотрение", () => {
    it("ученик подаёт заявку, повторная — отказ", async () => {
      expect((await post("/enrollment-requests", "STUDENT", { courseId: ids.paid })).status).toBe(201);
      const again = await post("/enrollment-requests", "STUDENT", { courseId: ids.paid });
      expect(again.status).toBe(409);
      expect(again.body.message).toBe("alreadyRequested");
    });

    it("список заявок преподавателю — только по своим курсам", async () => {
      const mine = await get("/enrollment-requests", "TEACHER");
      expect(mine.body.length).toBeGreaterThan(0);
      const foreign = await get("/enrollment-requests", "otherTeacher");
      expect(foreign.body).toEqual([]);
    });

    it("ученик и родитель список заявок не видят", async () => {
      expect((await get("/enrollment-requests", "STUDENT")).status).toBe(403);
      expect((await get("/enrollment-requests", "PARENT")).status).toBe(403);
    });

    it("чужую заявку преподаватель не подтвердит: 404, а не 403", async () => {
      const req = await testDb().enrollmentRequest.findFirst({ where: { courseId: ids.paid } });
      const res = await post("/enrollment-requests/approve", "otherTeacher", { requestId: req!.id });
      expect(res.status).toBe(404);
    });

    it("подтверждение записывает студента и закрывает заявку", async () => {
      const req = await testDb().enrollmentRequest.findFirst({ where: { courseId: ids.paid } });
      const res = await post("/enrollment-requests/approve", "TEACHER", { requestId: req!.id });
      expect(res.status).toBe(201);

      const enrolled = await testDb().enrollment.count({
        where: { studentId: ids.STUDENT, courseId: ids.paid },
      });
      expect(enrolled).toBe(1);

      const again = await post("/enrollment-requests/approve", "TEACHER", { requestId: req!.id });
      expect(again.body.message).toBe("alreadyReviewed");
    });

    it("отклонение переводит заявку в REJECTED", async () => {
      const student = await createUser({ role: "STUDENT" });
      const cookie = await sessionCookie(student);
      await http()
        .post("/api/v2/enrollment-requests")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL)
        .send({ courseId: ids.paid });

      const req = await testDb().enrollmentRequest.findFirst({
        where: { courseId: ids.paid, studentId: student.id },
      });
      expect((await post("/enrollment-requests/reject", "ADMIN", { requestId: req!.id })).status).toBe(201);
      const row = await testDb().enrollmentRequest.findUnique({ where: { id: req!.id } });
      expect(row?.status).toBe("REJECTED");
    });
  });

  describe("копирование курса", () => {
    it("ученик копировать не может", async () => {
      expect((await post("/courses/copy", "STUDENT", { sourceCourseId: ids.free })).status).toBe(403);
    });

    it("копия содержит уроки и вопросы, но не опубликована", async () => {
      const lesson = await testDb().lesson.create({
        data: { slug: `l-${run}`, title: "Урок", courseId: ids.free, isPublished: true },
      });
      const assessment = await testDb().assessment.create({
        data: { type: "TEST", title: "Тест", courseId: ids.free, lessonId: lesson.id },
      });
      const question = await testDb().assessmentQuestion.create({
        data: { text: "2+2?", type: "SINGLE_CHOICE", assessmentId: assessment.id },
      });
      await testDb().assessmentAnswerOption.create({
        data: { text: "4", isCorrect: true, questionId: question.id },
      });

      const res = await post("/courses/copy", "TEACHER", { sourceCourseId: ids.free, newTitle: "Копия курса" });
      expect(res.status).toBe(201);

      const copy = await testDb().course.findUnique({
        where: { id: res.body.id },
        include: { lessons: { include: { assessment: { include: { questions: true } } } } },
      });
      expect(copy?.isPublished).toBe(false);
      expect(copy?.copiedFromId).toBe(ids.free);
      expect(copy?.lessons.length).toBe(1);
      expect(copy?.lessons[0].assessment?.questions.length).toBe(1);
    });
  });

  describe("Корзина", () => {
    it("видна только администратору", async () => {
      expect((await get("/trash/courses", "ADMIN")).status).toBe(200);
      expect((await get("/trash/courses", "TEACHER")).status).toBe(403);
      expect((await get("/trash/lessons", "STUDENT")).status).toBe(403);
    });

    it("курс восстанавливается, живой стереть нельзя", async () => {
      const course = await testDb().course.create({
        data: { slug: `t-${run}`, title: "В корзине", teacherId: ids.TEACHER, deletedAt: new Date() },
      });

      expect((await get("/trash/courses", "ADMIN")).body.some((c: { id: string }) => c.id === course.id)).toBe(true);

      expect((await post(`/trash/courses/${course.id}/restore`, "ADMIN")).status).toBe(201);
      const restored = await testDb().course.findUnique({ where: { id: course.id } });
      expect(restored?.deletedAt).toBeNull();

      const hard = await http()
        .delete(`/api/v2/trash/courses/${course.id}`)
        .set("Cookie", cookies.ADMIN)
        .set("Origin", TEST_APP_URL);
      expect(hard.status).toBe(409);
      expect(hard.body.message).toBe("notInTrash");
    });

    it("курс из Корзины стирается насовсем вместе с записью в журнале", async () => {
      const course = await testDb().course.create({
        data: { slug: `hard-${run}`, title: "Насовсем", teacherId: ids.TEACHER, deletedAt: new Date() },
      });
      const res = await http()
        .delete(`/api/v2/trash/courses/${course.id}`)
        .set("Cookie", cookies.ADMIN)
        .set("Origin", TEST_APP_URL);
      expect(res.status).toBe(200);

      expect(await testDb().course.count({ where: { id: course.id } })).toBe(0);
      const log = await testDb().auditLog.findFirst({
        where: { entityType: "Course", entityId: course.id, action: "DELETE" },
      });
      expect((log?.metadata as { hardDelete?: boolean })?.hardDelete).toBe(true);
    });

    it("урок удалённого курса восстановить нельзя — сначала курс", async () => {
      const course = await testDb().course.create({
        data: { slug: `lc-${run}`, title: "Курс в корзине", teacherId: ids.TEACHER, deletedAt: new Date() },
      });
      const lesson = await testDb().lesson.create({
        data: { slug: `ll-${run}`, title: "Урок", courseId: course.id, deletedAt: new Date() },
      });
      const res = await post(`/trash/lessons/${lesson.id}/restore`, "ADMIN");
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("courseInTrash");
    });
  });
});
