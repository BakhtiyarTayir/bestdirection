import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, testDb, type TestApp } from "./helpers";

describe("сводка и адреса", () => {
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

    const course = await testDb().course.create({
      data: { slug: `dash-${run}`, title: "Курс", teacherId: ids.TEACHER, isPublished: true },
    });
    ids.course = course.id;
    await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: course.id } });

    // Второй курс того же преподавателя с тем же учеником: по головам это
    // один ученик, а по записям было бы два
    const second = await testDb().course.create({
      data: { slug: `dash2-${run}`, title: "Второй курс", teacherId: ids.TEACHER, isPublished: true },
    });
    await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: second.id } });

    const lesson = await testDb().lesson.create({
      data: { slug: `urok-${run}`, title: "Урок", courseId: course.id, isPublished: true },
    });
    ids.lesson = lesson.id;

    const draft = await testDb().lesson.create({
      data: { slug: `chernovik-${run}`, title: "Черновик", courseId: course.id, isPublished: false },
    });
    ids.draftLesson = draft.id;

    const homework = await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `zadanie-${run}`,
        title: "Задание",
        description: "",
        type: "FILE",
        isPublished: true,
      },
    });
    ids.homework = homework.id;

    await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `skrytoe-${run}`,
        title: "Скрытое задание",
        description: "",
        type: "FILE",
        isPublished: false,
      },
    });

    // Чужой курс: его адрес ученик разрешать не должен
    const otherTeacher = await createUser({ role: "TEACHER" });
    const foreign = await testDb().course.create({
      data: { slug: `chuzhoy-${run}`, title: "Чужой курс", teacherId: otherTeacher.id, isPublished: true },
    });
    ids.foreignCourse = foreign.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, role?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v2${path}`);
    return role ? req.set("Cookie", cookies[role]) : req;
  };

  describe("сводка на главной", () => {
    it("администратор видит школу целиком", async () => {
      const res = await get("/dashboard/summary", "ADMIN");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("ADMIN");
      expect(res.body.users).toBeGreaterThan(0);
      expect(res.body.teachers).toBeGreaterThan(0);
      expect(res.body.students).toBeGreaterThan(0);
    });

    it("преподаватель видит свои курсы и учеников по головам", async () => {
      const res = await get("/dashboard/summary", "TEACHER");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("TEACHER");
      expect(res.body.courses).toBe(2);
      // Один ученик на двух курсах — это один ученик
      expect(res.body.students).toBe(1);
    });

    it("ученик видит свои курсы и только завершённые попытки", async () => {
      const assessment = await testDb().assessment.create({
        data: {
          type: "TEST",
          title: "Тест",
          courseId: ids.course,
          lessonId: ids.lesson,
          isPublished: true,
          passingScore: 50,
        },
      });
      await testDb().assessmentAttempt.create({
        data: {
          assessmentId: assessment.id,
          studentId: ids.STUDENT,
          attemptNumber: 1,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      // Незавершённая попытка: с этапа 4 строка заводится при старте
      await testDb().assessmentAttempt.create({
        data: {
          assessmentId: assessment.id,
          studentId: ids.STUDENT,
          attemptNumber: 2,
          startedAt: new Date(),
        },
      });

      const res = await get("/dashboard/summary", "STUDENT");
      expect(res.status).toBe(200);
      expect(res.body.courses).toBe(2);
      expect(res.body.tests).toBe(1);
    });

    it("курс в Корзине из сводки уходит", async () => {
      const trashed = await testDb().course.create({
        data: { slug: `korzina-${run}`, title: "Удалённый", teacherId: ids.TEACHER, isPublished: true },
      });
      await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: trashed.id } });
      await testDb().course.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });

      const forTeacher = await get("/dashboard/summary", "TEACHER");
      expect(forTeacher.body.courses).toBe(2);

      const forStudent = await get("/dashboard/summary", "STUDENT");
      expect(forStudent.body.courses).toBe(2);
    });

    it("без входа сводки нет", async () => {
      expect((await get("/dashboard/summary")).status).toBe(401);
    });
  });

  describe("разрешение адресов", () => {
    it("адрес курса, урока и задания превращается в идентификаторы", async () => {
      const res = await get(
        `/paths/resolve?courseSlug=dash-${run}&lessonSlug=urok-${run}&homeworkSlug=zadanie-${run}`,
        "STUDENT"
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        courseId: ids.course,
        lessonId: ids.lesson,
        homeworkId: ids.homework,
      });
    });

    it("чужой курс для ученика не существует", async () => {
      const res = await get(`/paths/resolve?courseSlug=chuzhoy-${run}`, "STUDENT");
      expect(res.status).toBe(404);

      // Преподавателю чужой курс открыт: он подменяет коллег
      expect((await get(`/paths/resolve?courseSlug=chuzhoy-${run}`, "TEACHER")).status).toBe(200);
    });

    it("черновик урока ученику не разрешается, персоналу — да", async () => {
      const path = `/paths/resolve?courseSlug=dash-${run}&lessonSlug=chernovik-${run}`;
      expect((await get(path, "STUDENT")).status).toBe(404);

      const forTeacher = await get(path, "TEACHER");
      expect(forTeacher.status).toBe(200);
      expect(forTeacher.body.lessonId).toBe(ids.draftLesson);
    });

    it("неопубликованное задание ученику не разрешается", async () => {
      const path = `/paths/resolve?courseSlug=dash-${run}&lessonSlug=urok-${run}&homeworkSlug=skrytoe-${run}`;
      expect((await get(path, "STUDENT")).status).toBe(404);
      expect((await get(path, "ADMIN")).status).toBe(200);
    });

    it("несуществующий адрес — 404", async () => {
      expect((await get(`/paths/resolve?courseSlug=net-takogo`, "ADMIN")).status).toBe(404);
    });
  });
});
