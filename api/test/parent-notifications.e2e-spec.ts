import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TelegramNotifyService } from "../src/common/telegram/telegram-notify.service";
import { WeeklyDigestService } from "../src/modules/parent-notifications/weekly-digest.service";
import {
  createBranch,
  createTestApp,
  createUser,
  sessionCookie,
  TEST_APP_URL,
  testDb,
  type TestApp,
} from "./helpers";

/** Сообщения в Telegram никуда не уходят: запоминаем, куда и что «отправили» (как в auth.e2e-spec.ts). */
class TelegramNotifyStub {
  readonly sent: { chatId: string; text: string }[] = [];

  async send(chatId: string | null | undefined, text: string) {
    if (!chatId) return;
    this.sent.push({ chatId, text });
  }
}

// PLAN-PARENT-PROGRESS-2026-09-24.md, раздел 2: пропуск занятия (2.1),
// проверенное домашнее задание (2.2), еженедельная сводка (2.3).
describe("уведомления родителям об успеваемости ребёнка", () => {
  let app: TestApp;
  const telegram = new TelegramNotifyStub();
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ provide: TelegramNotifyService, useValue: telegram }] });

    const teacher = await createUser({ role: "TEACHER" });
    ids.teacher = teacher.id;
    cookies.TEACHER = await sessionCookie(teacher, { roleInToken: "TEACHER" });

    const student = await createUser({ role: "STUDENT" });
    ids.student = student.id;

    // Три родителя одного ребёнка: с Telegram, без Telegram и с отключёнными
    // уведомлениями — ровно три случая, которые НЕ должны получить сообщение,
    // кроме первого.
    const parentWithTelegram = await createUser({ role: "PARENT", telegramChatId: "chat-1" });
    ids.parentWithTelegram = parentWithTelegram.id;

    const parentWithoutTelegram = await createUser({ role: "PARENT" });
    ids.parentWithoutTelegram = parentWithoutTelegram.id;

    const parentDisabled = await createUser({ role: "PARENT", telegramChatId: "chat-2" });
    await testDb().user.update({
      where: { id: parentDisabled.id },
      data: { parentProgressNotifications: false },
    });
    ids.parentDisabled = parentDisabled.id;

    await testDb().parentStudent.createMany({
      data: [
        { parentId: ids.parentWithTelegram, studentId: ids.student },
        { parentId: ids.parentWithoutTelegram, studentId: ids.student },
        { parentId: ids.parentDisabled, studentId: ids.student },
      ],
    });

    const course = await testDb().course.create({
      data: { slug: `pn-${run}`, title: "Курс уведомлений", teacherId: ids.teacher, isPublished: true },
    });
    ids.course = course.id;

    const branch = await createBranch();
    const group = await testDb().group.create({
      data: { name: `PG-${run}`, courseId: course.id, teacherId: ids.teacher, branchId: branch.id },
    });
    ids.group = group.id;

    await testDb().enrollment.create({
      data: { studentId: ids.student, courseId: course.id, groupId: group.id },
    });

    const lesson = await testDb().lesson.create({
      data: { slug: `pn-lesson-${run}`, title: "Урок", courseId: course.id, isPublished: true },
    });
    ids.lesson = lesson.id;

    const homework = await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `pn-hw-${run}`,
        title: "Проверочная работа",
        description: "",
        type: "FILE",
        isPublished: true,
        maxScore: 100,
      },
    });
    ids.homework = homework.id;

    const session = await testDb().attendanceSession.create({
      data: {
        courseId: course.id,
        groupId: group.id,
        teacherId: ids.teacher,
        date: new Date("2026-09-21T00:00:00.000Z"), // понедельник — внутри недели, которую проверит 2.3
      },
    });
    ids.session = session.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const send = (method: "post" | "patch", path: string, role: string, body?: object) =>
    http()[method](`/api/v2${path}`).set("Cookie", cookies[role]).set("Origin", TEST_APP_URL).send(body);

  describe("2.1 пропуск занятия", () => {
    it("переход в ABSENT — только родителю с Telegram и включёнными уведомлениями", async () => {
      telegram.sent.length = 0;
      const res = await send("patch", `/attendance/sessions/${ids.session}/records`, "TEACHER", {
        records: [{ studentId: ids.student, status: "ABSENT" }],
      });
      expect(res.status).toBe(200);

      const toEnabledParent = telegram.sent.filter((m) => m.chatId === "chat-1");
      expect(toEnabledParent.length).toBe(1);
      expect(toEnabledParent[0].text).toContain(`PG-${run}`);
      // Без Telegram и с отключёнными уведомлениями — молча пропущены
      expect(telegram.sent.some((m) => m.chatId === "chat-2")).toBe(false);
    });

    it("повторное сохранение с тем же ABSENT не шлёт уведомление снова", async () => {
      telegram.sent.length = 0;
      const res = await send("patch", `/attendance/sessions/${ids.session}/records`, "TEACHER", {
        records: [{ studentId: ids.student, status: "ABSENT", note: "опоздал на 20 минут" }],
      });
      expect(res.status).toBe(200);
      expect(telegram.sent.length).toBe(0);
    });

    it("переход ABSENT → PRESENT не уведомляет, а следующий переход в ABSENT — снова уведомляет", async () => {
      telegram.sent.length = 0;
      await send("patch", `/attendance/sessions/${ids.session}/records`, "TEACHER", {
        records: [{ studentId: ids.student, status: "PRESENT" }],
      });
      expect(telegram.sent.length).toBe(0);

      await send("patch", `/attendance/sessions/${ids.session}/records`, "TEACHER", {
        records: [{ studentId: ids.student, status: "ABSENT" }],
      });
      expect(telegram.sent.filter((m) => m.chatId === "chat-1").length).toBe(1);
    });
  });

  describe("2.2 проверено домашнее задание", () => {
    it("проверка работы шлёт родителю статус и оценку", async () => {
      telegram.sent.length = 0;
      const submission = await testDb().submission.create({
        data: {
          homeworkId: ids.homework,
          studentId: ids.student,
          code: "[File: решение.txt]",
          status: "PENDING",
          manualStatus: "PENDING",
          attemptNumber: 1,
        },
      });
      ids.submission = submission.id;

      const res = await send("post", `/submissions/${submission.id}/review`, "TEACHER", {
        status: "APPROVED",
        manualScore: 85,
      });
      expect(res.status).toBe(201);

      const toEnabledParent = telegram.sent.filter((m) => m.chatId === "chat-1");
      expect(toEnabledParent.length).toBe(1);
      expect(toEnabledParent[0].text).toContain("Проверочная работа");
      expect(toEnabledParent[0].text).toContain("85/100");
      expect(telegram.sent.some((m) => m.chatId === "chat-2")).toBe(false);
    });

    it("отклонённая работа — тоже событие «проверили», родитель узнаёт", async () => {
      telegram.sent.length = 0;
      const submission = await testDb().submission.create({
        data: {
          homeworkId: ids.homework,
          studentId: ids.student,
          code: "[File: решение2.txt]",
          status: "PENDING",
          manualStatus: "PENDING",
          attemptNumber: 2,
        },
      });
      const res = await send("post", `/submissions/${submission.id}/review`, "TEACHER", {
        status: "REJECTED",
        comment: "Не по теме",
      });
      expect(res.status).toBe(201);
      expect(telegram.sent.filter((m) => m.chatId === "chat-1").length).toBe(1);
    });
  });

  describe("2.3 еженедельная сводка", () => {
    it("run() собирает сводку за прошедшую неделю и шлёт один раз; повторный вызов той же недели — пропуск", async () => {
      const digest = app.get(WeeklyDigestService);
      telegram.sent.length = 0;

      // Понедельник — момент, на который назначен cron; неделя [2026-09-21..27]
      // как раз содержит занятие из блока 2.1
      const now = new Date("2026-09-28T04:00:00.000Z");
      const first = await digest.run(now);
      expect(first.skipped).toBeNull();
      expect(first.sent).toBeGreaterThan(0);

      const toEnabledParent = telegram.sent.filter((m) => m.chatId === "chat-1");
      expect(toEnabledParent.length).toBe(1); // один ребёнок у этого родителя
      expect(toEnabledParent[0].text).toContain("Проверочная работа");
      expect(telegram.sent.some((m) => m.chatId === "chat-2")).toBe(false);

      telegram.sent.length = 0;
      const second = await digest.run(now);
      expect(second.skipped).toBe("already-sent");
      expect(second.sent).toBe(0);
      expect(telegram.sent.length).toBe(0);
    });

    it("PARENT_WEEKLY_DIGEST=off — рассылки нет вообще", async () => {
      process.env.PARENT_WEEKLY_DIGEST = "off";
      try {
        telegram.sent.length = 0;
        const digest = app.get(WeeklyDigestService);
        // Другая неделя — иначе одного «уже отправлено» было бы достаточно
        // самого по себе, а здесь важно, что выключатель сработал раньше
        const result = await digest.run(new Date("2026-10-05T04:00:00.000Z"));
        expect(result.skipped).toBe("off");
        expect(telegram.sent.length).toBe(0);
      } finally {
        delete process.env.PARENT_WEEKLY_DIGEST;
      }
    });
  });
});
