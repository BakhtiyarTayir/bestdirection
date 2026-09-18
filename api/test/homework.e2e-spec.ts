import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("домашние задания", () => {
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
      data: { slug: `hw-${run}`, title: "Курс", teacherId: ids.TEACHER, isPublished: true },
    });
    ids.course = course.id;
    await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: course.id } });

    const lesson = await testDb().lesson.create({
      data: { slug: `hw-lesson-${run}`, title: "Урок", courseId: course.id, isPublished: true },
    });
    ids.lesson = lesson.id;

    // Чужой курс: преподаватель из него не должен трогать наши задания
    const otherTeacher = await createUser({ role: "TEACHER" });
    ids.otherTeacher = otherTeacher.id;
    cookies.OTHER_TEACHER = await sessionCookie(otherTeacher, { roleInToken: "TEACHER" });
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
  const upload = (path: string, role: string, content: Buffer, filename: string) =>
    http()
      .post(`/api/v2${path}`)
      .set("Cookie", cookies[role])
      .set("Origin", TEST_APP_URL)
      .attach("file", content, filename);

  describe("права на задания", () => {
    it("ученик и родитель задание не создают", async () => {
      for (const role of ["STUDENT", "PARENT"]) {
        const res = await send("post", "/homework", role, {
          lessonId: ids.lesson,
          title: "Чужое",
          description: "",
        });
        expect(res.status, role).toBe(403);
      }
    });

    it("преподаватель не заводит задание в чужом курсе", async () => {
      const res = await send("post", "/homework", "OTHER_TEACHER", {
        lessonId: ids.lesson,
        title: "Чужое",
        description: "",
      });
      expect(res.status).toBe(403);
    });

    it("задание создаётся со slug и становится файловым по умолчанию", async () => {
      const res = await send("post", "/homework", "TEACHER", {
        lessonId: ids.lesson,
        title: "Работа с файлом",
        description: "Прислать решение файлом",
        maxAttempts: 2,
      });
      expect(res.status).toBe(201);
      expect(res.body.slug).toBeTruthy();
      expect(res.body.type).toBe("FILE");
      // Файловую работу всегда проверяет человек
      expect(res.body.requiresManualReview).toBe(true);
      ids.homework = res.body.id;
    });

    it("черновик ученику не виден, опубликованное — видно", async () => {
      expect((await get(`/homework/${ids.homework}/student`, "STUDENT")).status).toBe(404);

      const published = await send("post", `/homework/${ids.homework}/publish`, "TEACHER");
      expect(published.status).toBe(201);
      expect(published.body.isPublished).toBe(true);

      const forStudent = await get(`/homework/${ids.homework}/student`, "STUDENT");
      expect(forStudent.status).toBe(200);
      expect(forStudent.body.homework.title).toBe("Работа с файлом");
    });

    it("список заданий урока прячет черновики от ученика", async () => {
      const draft = await send("post", "/homework", "TEACHER", {
        lessonId: ids.lesson,
        title: "Черновик задания",
        description: "",
      });
      ids.draftHomework = draft.body.id;

      const forStudent = await get(`/homework?lessonId=${ids.lesson}`, "STUDENT");
      expect(forStudent.body.map((hw: { id: string }) => hw.id)).not.toContain(ids.draftHomework);
      const forTeacher = await get(`/homework?lessonId=${ids.lesson}`, "TEACHER");
      expect(forTeacher.body.map((hw: { id: string }) => hw.id)).toContain(ids.draftHomework);
    });
  });

  describe("регрессия аудита 3.5: скрытые проверки", () => {
    const hidden: Record<string, string> = {};

    beforeAll(async () => {
      const homework = await testDb().homework.create({
        data: {
          lessonId: ids.lesson,
          slug: `code-${run}`,
          title: "Задание с проверками",
          description: "",
          type: "TEXT",
          isPublished: true,
          maxAttempts: 5,
          testCases: {
            create: [
              { input: "открытый вход", expected: "открытый ответ", isHidden: false, sortOrder: 0 },
              { input: "СЕКРЕТНЫЙ ВХОД", expected: "СЕКРЕТНЫЙ ОТВЕТ", isHidden: true, sortOrder: 1 },
            ],
          },
        },
        include: { testCases: true },
      });
      hidden.homework = homework.id;
      hidden.open = homework.testCases.find((t) => !t.isHidden)!.id;
      hidden.secret = homework.testCases.find((t) => t.isHidden)!.id;
    });

    it("ученику не приходят скрытые тест-кейсы задания", async () => {
      const res = await get(`/homework/${hidden.homework}/student`, "STUDENT");
      expect(res.status).toBe(200);
      expect(res.body.homework.testCases).toHaveLength(1);
      expect(JSON.stringify(res.body)).not.toContain("СЕКРЕТНЫЙ");
    });

    it("скрытая проверка не утекает и в разборе своей сдачи", async () => {
      const submission = await testDb().submission.create({
        data: {
          homeworkId: hidden.homework,
          studentId: ids.STUDENT,
          code: "решение",
          status: "PARTIAL",
          attemptNumber: 1,
          testResults: {
            create: [
              { testCaseId: hidden.open, passed: true, actualOutput: "открытый ответ" },
              { testCaseId: hidden.secret, passed: false, actualOutput: "СЕКРЕТНЫЙ ОТВЕТ" },
            ],
          },
        },
      });

      const res = await get(`/homework/${hidden.homework}/student`, "STUDENT");
      expect(JSON.stringify(res.body)).not.toContain("СЕКРЕТНЫЙ");

      const results = res.body.submissions[0].testResults;
      const secret = results.find((r: { testCase: { isHidden: boolean } }) => r.testCase.isHidden);
      // Ученик узнаёт только, прошла ли скрытая проверка
      expect(secret.passed).toBe(false);
      expect(secret.testCase.input).toBeNull();
      expect(secret.testCase.expected).toBeNull();
      expect(secret.actualOutput).toBeNull();

      // Преподавателю скрытые проверки видны целиком
      const forTeacher = await get(`/submissions/${submission.id}`, "TEACHER");
      expect(forTeacher.status).toBe(200);
      expect(JSON.stringify(forTeacher.body)).toContain("СЕКРЕТНЫЙ");

      await testDb().submission.delete({ where: { id: submission.id } });
    });
  });

  describe("регрессия аудита 3.4: лимит попыток", () => {
    it("параллельные сдачи не создают попыток сверх лимита", async () => {
      const homework = await testDb().homework.create({
        data: {
          lessonId: ids.lesson,
          slug: `race-${run}`,
          title: "Гонка",
          description: "",
          type: "TEXT",
          isPublished: true,
          maxAttempts: 2,
        },
      });

      const attempts = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          send("post", `/homework/${homework.id}/submissions`, "STUDENT", { code: `решение ${index}` })
        )
      );

      const created = attempts.filter((res) => res.status === 201);
      const rejected = attempts.filter((res) => res.status === 409);
      expect(created.length).toBe(2);
      expect(rejected.length).toBe(3);

      const rows = await testDb().submission.count({
        where: { homeworkId: homework.id, studentId: ids.STUDENT },
      });
      expect(rows).toBe(2);
    });
  });

  describe("регрессия аудита 3.6: балл проверки", () => {
    it("балл выше максимального не принимается", async () => {
      const homework = await testDb().homework.create({
        data: {
          lessonId: ids.lesson,
          slug: `score-${run}`,
          title: "Проверка балла",
          description: "",
          type: "FILE",
          isPublished: true,
          maxScore: 100,
        },
      });
      const submission = await testDb().submission.create({
        data: {
          homeworkId: homework.id,
          studentId: ids.STUDENT,
          code: "[File: решение.txt]",
          status: "PENDING",
          manualStatus: "PENDING",
          attemptNumber: 1,
        },
      });

      const tooMuch = await send("post", `/submissions/${submission.id}/review`, "TEACHER", {
        status: "APPROVED",
        manualScore: 1000,
      });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.message).toBe("scoreAboveMax");

      const fine = await send("post", `/submissions/${submission.id}/review`, "TEACHER", {
        status: "APPROVED",
        manualScore: 90,
        comment: "хорошо",
      });
      expect(fine.status).toBe(201);
      expect(fine.body.manualScore).toBe(90);
    });

    it("чужую работу преподаватель не проверяет", async () => {
      const submission = await testDb().submission.findFirst({
        where: { homework: { lessonId: ids.lesson } },
        select: { id: true },
      });
      const res = await send("post", `/submissions/${submission!.id}/review`, "OTHER_TEACHER", {
        status: "APPROVED",
      });
      expect(res.status).toBe(403);
    });
  });

  describe("сдача файлом и выдача файлов", () => {
    it("файл принимается, выдаётся владельцу и преподавателю, но не чужому", async () => {
      const homework = await testDb().homework.create({
        data: {
          lessonId: ids.lesson,
          slug: `file-${run}`,
          title: "Файловая работа",
          description: "",
          type: "FILE",
          isPublished: true,
          maxAttempts: 3,
        },
      });

      const sent = await upload(
        `/homework/${homework.id}/submissions/file`,
        "STUDENT",
        Buffer.from("print('решение')"),
        "solution.py"
      );
      expect(sent.status).toBe(201);
      expect(sent.body.files).toHaveLength(1);
      const fileId = sent.body.files[0].id as string;

      // octet-stream supertest отдаёт буфером, а не текстом
      const forOwner = await get(`/files/${fileId}`, "STUDENT").buffer(true);
      expect(forOwner.status).toBe(200);
      expect(Buffer.from(forOwner.body).toString("utf-8")).toContain("решение");

      const forTeacher = await get(`/files/${fileId}`, "TEACHER");
      expect(forTeacher.status).toBe(200);

      // Ученик того же курса, но чужая работа
      const other = await createUser({ role: "STUDENT" });
      await testDb().enrollment.create({ data: { studentId: other.id, courseId: ids.course } });
      const otherCookie = await sessionCookie(other, { roleInToken: "STUDENT" });
      const foreign = await request(app.getHttpServer())
        .get(`/api/v2/files/${fileId}`)
        .set("Cookie", otherCookie);
      expect(foreign.status).toBe(403);

      // Скачивание всегда вложением и без угадывания типа браузером
      const download = await get(`/files/${fileId}/download`, "TEACHER");
      expect(download.headers["content-disposition"]).toContain("attachment");
      expect(download.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("исполняемое расширение не принимается", async () => {
      const homework = await testDb().homework.create({
        data: {
          lessonId: ids.lesson,
          slug: `html-${run}`,
          title: "Файл с html",
          description: "",
          type: "FILE",
          isPublished: true,
        },
      });

      const res = await upload(
        `/homework/${homework.id}/submissions/file`,
        "STUDENT",
        Buffer.from("<script>alert(1)</script>"),
        "solution.html"
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("fileTypeNotAllowed");

      const rows = await testDb().submission.count({ where: { homeworkId: homework.id } });
      expect(rows).toBe(0);
    });

    it("не записанный на курс ученик не сдаёт", async () => {
      const outsider = await createUser({ role: "STUDENT" });
      const outsiderCookie = await sessionCookie(outsider, { roleInToken: "STUDENT" });
      const res = await request(app.getHttpServer())
        .post(`/api/v2/homework/${ids.homework}/submissions`)
        .set("Cookie", outsiderCookie)
        .set("Origin", TEST_APP_URL)
        .send({ code: "решение" });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("notEnrolled");
    });
  });

  describe("загрузка картинок и видео", () => {
    it("картинку принимает персонал, ученик — нет", async () => {
      const res = await upload("/uploads/image", "TEACHER", Buffer.from("картинка"), "cover.png");
      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/^\/uploads\/images\//);

      const forStudent = await upload("/uploads/image", "STUDENT", Buffer.from("картинка"), "cover.png");
      expect(forStudent.status).toBe(403);
    });

    it("чужое расширение отклоняется", async () => {
      const res = await upload("/uploads/video", "TEACHER", Buffer.from("не видео"), "clip.exe");
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("fileTypeNotAllowed");
    });
  });

  describe("выгрузка и загрузка заданий", () => {
    it("выгруженный JSON загружается обратно черновиками", async () => {
      const exported = await get(`/homework/export/${ids.lesson}`, "TEACHER");
      expect(exported.status).toBe(200);
      expect(exported.headers["content-disposition"]).toContain("attachment");

      const before = await testDb().homework.count({ where: { lessonId: ids.lesson } });
      const imported = await upload(
        `/homework/import/${ids.lesson}`,
        "TEACHER",
        Buffer.from(exported.text),
        "homeworks.json"
      );
      expect(imported.status).toBe(201);
      expect(imported.body.count).toBe(before);

      const after = await testDb().homework.findMany({
        where: { lessonId: ids.lesson },
        select: { isPublished: true },
      });
      expect(after.length).toBe(before * 2);
      // Загруженные остаются черновиками: публикует человек
      expect(after.filter((hw) => hw.isPublished).length).toBe(
        (await testDb().homework.count({ where: { lessonId: ids.lesson, isPublished: true } }))
      );
    });

    it("задание CODE загружается как файловое: автопроверки нет", async () => {
      const payload = JSON.stringify({
        homeworks: [{ title: "Код на питоне", description: "", type: "CODE", language: "PYTHON" }],
      });
      const res = await upload(
        `/homework/import/${ids.lesson}`,
        "TEACHER",
        Buffer.from(payload),
        "code.json"
      );
      expect(res.status).toBe(201);

      const created = await testDb().homework.findFirst({
        where: { lessonId: ids.lesson, title: "Код на питоне" },
        select: { type: true, requiresManualReview: true },
      });
      expect(created?.type).toBe("FILE");
      expect(created?.requiresManualReview).toBe(true);
    });

    it("битый файл отклоняется понятной ошибкой", async () => {
      const res = await upload(
        `/homework/import/${ids.lesson}`,
        "TEACHER",
        Buffer.from("это не json"),
        "broken.json"
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("invalidHomeworkImportPayload");
    });

    it("чужой урок не выгружается", async () => {
      expect((await get(`/homework/export/${ids.lesson}`, "OTHER_TEACHER")).status).toBe(404);
    });
  });

  describe("публичные страницы: гостю только бесплатные курсы", () => {
    const free: Record<string, string> = {};

    beforeAll(async () => {
      const course = await testDb().course.create({
        data: {
          slug: `free-${run}`,
          title: "Бесплатный курс",
          teacherId: ids.TEACHER,
          isPublished: true,
          accessType: "FREE",
        },
      });
      free.course = course.id;
      const lesson = await testDb().lesson.create({
        data: {
          slug: `free-lesson-${run}`,
          title: "Открытый урок",
          content: "ОТКРЫТЫЙ ТЕКСТ",
          courseId: course.id,
          isPublished: true,
        },
      });
      free.lesson = lesson.id;
      await testDb().homework.create({
        data: {
          lessonId: lesson.id,
          slug: `free-hw-${run}`,
          title: "Открытое задание",
          description: "ОТКРЫТОЕ ЗАДАНИЕ",
          type: "FILE",
          isPublished: true,
          testCases: {
            create: [
              { input: "видно", expected: "видно", isHidden: false, sortOrder: 0 },
              { input: "СКРЫТО", expected: "СКРЫТО", isHidden: true, sortOrder: 1 },
            ],
          },
        },
      });
    });

    it("урок и задание бесплатного курса открыты без входа", async () => {
      const lesson = await get(`/public/lessons/free-${run}/free-lesson-${run}`);
      expect(lesson.status).toBe(200);
      expect(lesson.body.lesson.content).toContain("ОТКРЫТЫЙ ТЕКСТ");

      const homework = await get(`/public/homework/free-${run}/free-lesson-${run}/free-hw-${run}`);
      expect(homework.status).toBe(200);
      expect(homework.body.description).toContain("ОТКРЫТОЕ ЗАДАНИЕ");
      // Скрытые проверки не показываем и гостю (аудит 3.5)
      expect(JSON.stringify(homework.body)).not.toContain("СКРЫТО");
    });

    it("урок и задание платного курса гостю закрыты (аудит 2.9)", async () => {
      // ids.course заведён платным по умолчанию
      const lessonSlug = `hw-lesson-${run}`;
      const paid = await get(`/public/lessons/hw-${run}/${lessonSlug}`);
      expect(paid.status).toBe(404);

      const paidHomework = await get(`/public/homework/hw-${run}/${lessonSlug}/file-${run}`);
      expect(paidHomework.status).toBe(404);
    });

    it("черновик бесплатного курса гостю не виден", async () => {
      const draft = await testDb().lesson.create({
        data: {
          slug: `free-draft-${run}`,
          title: "Черновик",
          courseId: free.course,
          isPublished: false,
        },
      });
      const res = await get(`/public/lessons/free-${run}/free-draft-${run}`);
      expect(res.status).toBe(404);
      await testDb().lesson.delete({ where: { id: draft.id } });
    });
  });

  describe("счётчик заданий", () => {
    it("ученику считает несделанное, преподавателю — работы на проверке", async () => {
      const forStudent = await get("/homework/counts", "STUDENT");
      expect(forStudent.status).toBe(200);
      expect(typeof forStudent.body.count).toBe("number");

      const forTeacher = await get("/homework/counts", "TEACHER");
      expect(forTeacher.status).toBe(200);
      expect(typeof forTeacher.body.count).toBe("number");
    });
  });
});
