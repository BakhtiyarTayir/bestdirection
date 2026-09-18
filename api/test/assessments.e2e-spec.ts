import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("уроки, тесты и экзамены", () => {
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
    await testDb().parentStudent.create({ data: { parentId: ids.PARENT, studentId: ids.STUDENT } });

    const course = await testDb().course.create({
      data: { slug: `l-${run}`, title: "Курс", teacherId: ids.TEACHER, isPublished: true },
    });
    ids.course = course.id;
    await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: course.id } });

    const published = await testDb().lesson.create({
      data: { slug: `pub-${run}`, title: "Урок", courseId: course.id, isPublished: true },
    });
    ids.lesson = published.id;
    const draft = await testDb().lesson.create({
      data: { slug: `draft-${run}`, title: "Черновик урока", courseId: course.id, isPublished: false },
    });
    ids.draftLesson = draft.id;

    // Тест урока с одним вопросом
    const test = await testDb().assessment.create({
      data: {
        type: "TEST",
        title: "Тест урока",
        courseId: course.id,
        lessonId: published.id,
        isPublished: true,
        passingScore: 50,
      },
    });
    ids.test = test.id;
    const question = await testDb().assessmentQuestion.create({
      data: { text: "2+2?", type: "SINGLE_CHOICE", assessmentId: test.id, points: 1 },
    });
    ids.question = question.id;
    const right = await testDb().assessmentAnswerOption.create({
      data: { text: "4", isCorrect: true, questionId: question.id, sortOrder: 0 },
    });
    ids.right = right.id;
    await testDb().assessmentAnswerOption.create({
      data: { text: "5", isCorrect: false, questionId: question.id, sortOrder: 1 },
    });

    // Экзамен курса
    const exam = await testDb().assessment.create({
      data: {
        type: "EXAM",
        title: "Экзамен",
        courseId: course.id,
        isPublished: true,
        passingScore: 50,
        maxAttempts: 2,
      },
    });
    ids.exam = exam.id;
    const examQuestion = await testDb().assessmentQuestion.create({
      data: { text: "Столица?", type: "SINGLE_CHOICE", assessmentId: exam.id, points: 1 },
    });
    ids.examQuestion = examQuestion.id;
    const examRight = await testDb().assessmentAnswerOption.create({
      data: { text: "Ташкент", isCorrect: true, questionId: examQuestion.id, sortOrder: 0 },
    });
    ids.examRight = examRight.id;
    await testDb().assessmentAnswerOption.create({
      data: { text: "Самарканд", isCorrect: false, questionId: examQuestion.id, sortOrder: 1 },
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

  describe("регрессия аудита 2.4: черновики и ключи к ответам", () => {
    it("ключи к ответам видит персонал, но не ученик и не родитель", async () => {
      const forTeacher = await get(`/assessments/${ids.test}`, "TEACHER");
      expect(forTeacher.body.questions[0].options[0]).toHaveProperty("isCorrect");

      for (const role of ["STUDENT", "PARENT"]) {
        const res = await get(`/assessments/${ids.test}`, role);
        expect(res.status, role).toBe(200);
        expect(res.body.questions[0].options[0], role).not.toHaveProperty("isCorrect");
      }
    });

    it("то же для теста по уроку", async () => {
      const res = await get(`/assessments/by-lesson?lessonId=${ids.lesson}`, "PARENT");
      expect(res.body.questions[0].options[0]).not.toHaveProperty("isCorrect");
    });

    it("неопубликованный урок недоступен ученику и родителю", async () => {
      expect((await get(`/lessons/${ids.draftLesson}`, "TEACHER")).status).toBe(200);
      expect((await get(`/lessons/${ids.draftLesson}`, "STUDENT")).status).toBe(404);
      expect((await get(`/lessons/${ids.draftLesson}`, "PARENT")).status).toBe(404);
    });

    it("черновики не попадают в список уроков", async () => {
      const forStudent = await get(`/lessons?courseId=${ids.course}`, "STUDENT");
      expect(forStudent.body.map((l: { id: string }) => l.id)).not.toContain(ids.draftLesson);
      const forTeacher = await get(`/lessons?courseId=${ids.course}`, "TEACHER");
      expect(forTeacher.body.map((l: { id: string }) => l.id)).toContain(ids.draftLesson);
    });

    it("родитель видит результаты своего ребёнка и не видит чужого", async () => {
      const other = await createUser({ role: "STUDENT" });
      expect((await get(`/assessments/results?studentId=${ids.STUDENT}`, "PARENT")).status).toBe(200);
      expect((await get(`/assessments/results?studentId=${other.id}`, "PARENT")).status).toBe(404);
    });
  });

  describe("регрессия аудита 3.2: экзамен без допуска", () => {
    it("экзамен нельзя начать, пока не сдан тест урока", async () => {
      const eligibility = await get(`/assessments/${ids.exam}/eligibility`, "STUDENT");
      expect(eligibility.body.eligible).toBe(false);
      expect(eligibility.body.unpassedTests.length).toBe(1);

      const start = await send("post", `/assessments/${ids.exam}/attempts`, "STUDENT");
      expect(start.status).toBe(403);
      expect(start.body.message).toBe("notEligible");
    });

    it("после сдачи теста экзамен открывается", async () => {
      const start = await send("post", `/assessments/${ids.test}/attempts`, "STUDENT");
      expect(start.status).toBe(201);

      const submit = await send("post", `/assessments/attempts/${start.body.id}/submit`, "STUDENT", {
        answers: [{ questionId: ids.question, selectedOptionIds: [ids.right] }],
      });
      expect(submit.status).toBe(201);
      expect(submit.body.isPassed).toBe(true);

      const eligibility = await get(`/assessments/${ids.exam}/eligibility`, "STUDENT");
      expect(eligibility.body.eligible).toBe(true);
    });
  });

  describe("регрессия аудита 3.3: время считает сервер", () => {
    it("старт попытки возвращает крайний срок", async () => {
      const timed = await testDb().assessment.create({
        data: {
          type: "TEST",
          title: "На время",
          courseId: ids.course,
          isPublished: true,
          timeLimitMin: 10,
          maxAttempts: 5,
        },
      });
      const start = await send("post", `/assessments/${timed.id}/attempts`, "STUDENT");
      expect(start.status).toBe(201);
      expect(new Date(start.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      ids.timed = timed.id;
      ids.timedAttempt = start.body.id;
    });

    it("просроченная попытка не принимается и закрывается нулём", async () => {
      // Отматываем старт на час назад — как если бы студент ушёл и вернулся
      await testDb().assessmentAttempt.update({
        where: { id: ids.timedAttempt },
        data: { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const res = await send("post", `/assessments/attempts/${ids.timedAttempt}/submit`, "STUDENT", {
        answers: [],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("timeIsUp");

      const attempt = await testDb().assessmentAttempt.findUnique({ where: { id: ids.timedAttempt } });
      expect(attempt?.completedAt).not.toBeNull();
      expect(attempt?.score).toBe(0);
    });

    it("одну попытку нельзя отправить дважды", async () => {
      const start = await send("post", `/assessments/${ids.timed}/attempts`, "STUDENT");
      const first = await send("post", `/assessments/attempts/${start.body.id}/submit`, "STUDENT", {
        answers: [],
      });
      expect(first.status).toBe(201);
      const second = await send("post", `/assessments/attempts/${start.body.id}/submit`, "STUDENT", {
        answers: [],
      });
      expect(second.status).toBe(409);
      expect(second.body.message).toBe("attemptAlreadyCompleted");
    });

    it("чужую попытку отправить нельзя", async () => {
      const start = await send("post", `/assessments/${ids.timed}/attempts`, "STUDENT");
      const stranger = await createUser({ role: "STUDENT" });
      const cookie = await sessionCookie(stranger);
      const res = await http()
        .post(`/api/v2/assessments/attempts/${start.body.id}/submit`)
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL)
        .send({ answers: [] });
      expect(res.status).toBe(404);
    });
  });

  describe("регрессия аудита 3.4: лимит попыток", () => {
    it("параллельные старты не создают попыток сверх лимита", async () => {
      const limited = await testDb().assessment.create({
        data: { type: "TEST", title: "Одна попытка", courseId: ids.course, isPublished: true, maxAttempts: 1 },
      });

      const results = await Promise.all(
        Array.from({ length: 5 }, () => send("post", `/assessments/${limited.id}/attempts`, "STUDENT"))
      );
      const created = results.filter((res) => res.status === 201);
      expect(created.length).toBe(1);

      const attempts = await testDb().assessmentAttempt.count({ where: { assessmentId: limited.id } });
      expect(attempts).toBe(1);
    });
  });

  describe("права на изменение", () => {
    it("ученик не создаёт уроки и тесты", async () => {
      expect((await send("post", "/lessons", "STUDENT", { courseId: ids.course, title: "Х" })).status).toBe(403);
      expect(
        (await send("post", "/assessments", "STUDENT", { courseId: ids.course, type: "TEST", title: "Х" })).status
      ).toBe(403);
    });

    it("преподаватель не трогает чужой курс", async () => {
      const other = await createUser({ role: "TEACHER" });
      const cookie = await sessionCookie(other, { roleInToken: "TEACHER" });
      const res = await http()
        .post("/api/v2/lessons")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL)
        .send({ courseId: ids.course, title: "Чужой урок" });
      expect(res.status).toBe(404);
    });

    it("урок создаётся со slug и уходит в Корзину при удалении", async () => {
      const created = await send("post", "/lessons", "TEACHER", {
        courseId: ids.course,
        title: "Новый урок",
        content: "текст",
      });
      expect(created.status).toBe(201);
      expect(created.body.slug).toMatch(/^novyy-urok/);

      const removed = await send("delete", `/lessons/${created.body.id}`, "TEACHER");
      expect(removed.status).toBe(200);
      const row = await testDb().lesson.findUnique({ where: { id: created.body.id } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
    });

    it("вопрос с одним вариантом не принимается", async () => {
      const res = await send("post", "/assessments/questions", "TEACHER", {
        assessmentId: ids.test,
        text: "Вопрос",
        type: "SINGLE_CHOICE",
        options: [{ text: "Только один" }],
      });
      expect(res.status).toBe(400);
    });
  });

  describe("прогресс ученика", () => {
    it("ученик отмечает урок пройденным, прогресс курса считается", async () => {
      const done = await send("post", `/lessons/${ids.lesson}/complete`, "STUDENT");
      expect(done.status).toBe(201);

      const progress = await get(`/lessons/progress?courseId=${ids.course}`, "STUDENT");
      expect(progress.body.completed).toBeGreaterThan(0);
    });

    it("преподаватель прогресс себе не пишет", async () => {
      expect((await send("post", `/lessons/${ids.lesson}/complete`, "TEACHER")).status).toBe(403);
    });
  });

  describe("свои попытки ученика", () => {
    // Отдельный тест, чтобы не зависеть от попыток из проверок выше
    const own: Record<string, string> = {};

    beforeAll(async () => {
      const assessment = await testDb().assessment.create({
        data: {
          type: "TEST",
          title: "Свои попытки",
          courseId: ids.course,
          isPublished: true,
          passingScore: 50,
          maxAttempts: 5,
        },
      });
      own.assessment = assessment.id;
      const question = await testDb().assessmentQuestion.create({
        data: { text: "3+3?", type: "SINGLE_CHOICE", assessmentId: assessment.id, points: 1 },
      });
      own.question = question.id;
      const right = await testDb().assessmentAnswerOption.create({
        data: { text: "6", isCorrect: true, questionId: question.id, sortOrder: 0 },
      });
      own.right = right.id;
      const wrong = await testDb().assessmentAnswerOption.create({
        data: { text: "7", isCorrect: false, questionId: question.id, sortOrder: 1 },
      });
      own.wrong = wrong.id;
    });

    const attempt = async (optionId: string) => {
      const started = await send("post", `/assessments/${own.assessment}/attempts`, "STUDENT");
      expect(started.status).toBe(201);
      const submitted = await send(
        "post",
        `/assessments/attempts/${started.body.id}/submit`,
        "STUDENT",
        { answers: [{ questionId: own.question, selectedOptionIds: [optionId] }] }
      );
      expect(submitted.status).toBe(201);
      return started.body.id as string;
    };

    it("ученик видит свои попытки с разбором, но не чужие", async () => {
      await attempt(own.wrong);
      await attempt(own.right);

      const mine = await get(`/assessments/${own.assessment}/attempts/mine`, "STUDENT");
      expect(mine.status).toBe(200);
      expect(mine.body).toHaveLength(2);
      expect(mine.body[0].answers[0].question.options[0]).toHaveProperty("isCorrect");

      // У другого ученика того же курса свой, пустой список
      const other = await createUser({ role: "STUDENT" });
      await testDb().enrollment.create({ data: { studentId: other.id, courseId: ids.course } });
      const otherCookie = await sessionCookie(other, { roleInToken: "STUDENT" });
      const foreign = await request(app.getHttpServer())
        .get(`/api/v2/assessments/${own.assessment}/attempts/mine`)
        .set("Cookie", otherCookie);
      expect(foreign.status).toBe(200);
      expect(foreign.body).toHaveLength(0);
    });

    it("незавершённая попытка приходит без ответов: иначе это подсказка во время теста", async () => {
      const started = await send("post", `/assessments/${own.assessment}/attempts`, "STUDENT");
      expect(started.status).toBe(201);

      // Сейчас ответы пишутся только при сдаче, поэтому строку заводим руками:
      // проверяем саму отсечку, а не то, что писать пока нечего
      await testDb().assessmentAttemptAnswer.create({
        data: {
          attemptId: started.body.id,
          questionId: own.question,
          selectedOptionIds: [own.right],
          isCorrect: true,
          pointsEarned: 1,
        },
      });

      const mine = await get(`/assessments/${own.assessment}/attempts/mine`, "STUDENT");
      const pending = mine.body.find((a: { id: string }) => a.id === started.body.id);
      expect(pending.completedAt).toBeNull();
      expect(pending.answers).toEqual([]);

      // прибираем за собой, иначе попытка съест лимит следующей проверки
      await testDb().assessmentAttempt.delete({ where: { id: started.body.id } });
    });

    it("лучший результат считается по завершённым попыткам", async () => {
      const best = await get(`/assessments/${own.assessment}/attempts/best`, "STUDENT");
      expect(best.status).toBe(200);
      expect(best.body.percentage).toBe(100);
      expect(best.body.isPassed).toBe(true);
    });
  });

  describe("допуск к экзаменам курса", () => {
    const other: Record<string, string> = {};

    beforeAll(async () => {
      const course = await testDb().course.create({
        data: { slug: `elig-${run}`, title: "Курс с допуском", teacherId: ids.TEACHER, isPublished: true },
      });
      other.course = course.id;
      await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: course.id } });
      const lesson = await testDb().lesson.create({
        data: { slug: `elig-lesson-${run}`, title: "Урок", courseId: course.id, isPublished: true },
      });
      await testDb().assessment.create({
        data: {
          type: "TEST",
          title: "Несданный тест",
          courseId: course.id,
          lessonId: lesson.id,
          isPublished: true,
          passingScore: 50,
        },
      });
    });

    it("ученику допуск закрыт, пока тест урока не сдан", async () => {
      const res = await get(`/assessments/eligibility?courseId=${other.course}`, "STUDENT");
      expect(res.status).toBe(200);
      expect(res.body.eligible).toBe(false);
      expect(res.body.unpassedTests).toHaveLength(1);
    });

    it("персоналу допуск не нужен", async () => {
      const res = await get(`/assessments/eligibility?courseId=${other.course}`, "TEACHER");
      expect(res.body.eligible).toBe(true);
    });
  });
});

describe("выгрузка и загрузка тестов", () => {
  let app: TestApp;
  const ids: Record<string, string> = {};
  let teacherCookie: string;
  const run = Date.now().toString(36);

  beforeAll(async () => {
    app = await createTestApp();
    const teacher = await createUser({ role: "TEACHER" });
    teacherCookie = await sessionCookie(teacher, { roleInToken: "TEACHER" });

    const course = await testDb().course.create({
      data: { slug: `exp-${run}`, title: "Курс выгрузки", teacherId: teacher.id },
    });
    ids.course = course.id;
    const lesson = await testDb().lesson.create({
      data: { slug: `exp-l-${run}`, title: "Урок", courseId: course.id },
    });
    ids.lesson = lesson.id;
    const target = await testDb().lesson.create({
      data: { slug: `exp-t-${run}`, title: "Урок для импорта", courseId: course.id },
    });
    ids.target = target.id;

    const assessment = await testDb().assessment.create({
      data: { type: "TEST", title: "Тест на выгрузку", courseId: course.id, lessonId: lesson.id },
    });
    const question = await testDb().assessmentQuestion.create({
      data: { text: "Вопрос с кириллицей?", type: "SINGLE_CHOICE", assessmentId: assessment.id },
    });
    await testDb().assessmentAnswerOption.createMany({
      data: [
        { text: "Верный", isCorrect: true, questionId: question.id, sortOrder: 0 },
        { text: "Неверный", isCorrect: false, questionId: question.id, sortOrder: 1 },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(["json", "csv", "xlsx"])("выгружается в %s", async (format) => {
    const res = await request(app.getHttpServer())
      .get(`/api/v2/assessments/export/test/${ids.lesson}?format=${format}`)
      .set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.length ?? res.text.length).toBeGreaterThan(0);
  });

  it("выгруженный xlsx загружается обратно — новый пакет читает свой же файл", async () => {
    const exported = await request(app.getHttpServer())
      .get(`/api/v2/assessments/export/test/${ids.lesson}?format=xlsx`)
      .set("Cookie", teacherCookie)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    const imported = await request(app.getHttpServer())
      .post(`/api/v2/assessments/import/test/${ids.target}`)
      .set("Cookie", teacherCookie)
      .set("Origin", TEST_APP_URL)
      .attach("file", exported.body as Buffer, "test.xlsx");

    expect(imported.status).toBe(201);
    expect(imported.body.questions).toBe(1);

    // Импортированное не публикуется само
    const created = await testDb().assessment.findUnique({ where: { id: imported.body.id } });
    expect(created?.isPublished).toBe(false);
  });

  it("у урока не может быть двух тестов", async () => {
    const exported = await request(app.getHttpServer())
      .get(`/api/v2/assessments/export/test/${ids.lesson}?format=json`)
      .set("Cookie", teacherCookie);

    const res = await request(app.getHttpServer())
      .post(`/api/v2/assessments/import/test/${ids.target}`)
      .set("Cookie", teacherCookie)
      .set("Origin", TEST_APP_URL)
      .attach("file", Buffer.from(exported.text), "test.json");
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("lessonAlreadyHasTest");
  });

  it("битый файл отклоняется понятной ошибкой", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v2/assessments/import/test/${ids.lesson}`)
      .set("Cookie", teacherCookie)
      .set("Origin", TEST_APP_URL)
      .attach("file", Buffer.from("это не таблица"), "broken.json");
    expect(res.status).toBe(400);
  });
});
