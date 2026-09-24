import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonths, currentMonthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, testDb, type TestApp } from "./helpers";

/** "YYYY-MM" + день → полночь UTC, как AttendanceSession.date (attendance.service.ts) */
function sessionDate(month: string, day: number): Date {
  return new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00.000Z`);
}

// Успеваемость ребёнка (план PLAN-PARENT-PROGRESS-2026-09-24.md, раздел 1):
// родитель видит только своего ребёнка (404 на чужого), ученик — только себя,
// преподаватель — только по лестнице «педагог группы → педагог курса»,
// администратор — любого. Числа посещаемости/заданий/тестов — на известных
// данных одного месяца, чтобы тест не зависел от даты запуска.
describe("успеваемость ученика", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const month = currentMonthKey();
  const prevMonth = addMonths(month, -1);

  beforeAll(async () => {
    app = await createTestApp();

    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    // Второй педагог — ведёт другую группу того же ученика по лестнице
    // «педагог группы», не будучи педагогом курса
    const groupTeacher = await createUser({ role: "TEACHER" });
    ids.groupTeacher = groupTeacher.id;
    cookies.groupTeacher = await sessionCookie(groupTeacher);
    // Совсем посторонний преподаватель — не ведёт ни курс, ни группу ученика
    const stranger = await createUser({ role: "TEACHER" });
    ids.stranger = stranger.id;
    cookies.stranger = await sessionCookie(stranger);
    // Педагог курса, к которому подставлен groupTeacher — проверяет, что курс
    // TEACHER не подмешивается в выборку groupTeacher
    const otherCourseTeacher = await createUser({ role: "TEACHER" });
    ids.otherCourseTeacher = otherCourseTeacher.id;

    const otherStudent = await createUser({ role: "STUDENT" });
    ids.otherStudent = otherStudent.id;
    const otherParent = await createUser({ role: "PARENT" });
    cookies.otherParent = await sessionCookie(otherParent);
    await testDb().parentStudent.create({
      data: { parentId: otherParent.id, studentId: otherStudent.id, relation: "OTHER" },
    });

    await testDb().parentStudent.create({
      data: { parentId: ids.PARENT, studentId: ids.STUDENT, relation: "MOTHER" },
    });

    const branch = await createBranch(`Успеваемость-${run}`);

    // ─── Курс "Свой": TEACHER — педагог курса, у группы своего педагога нет ──
    const courseOwn = await testDb().course.create({
      data: { slug: `progress-own-${run}`, title: "Курс свой", teacherId: ids.TEACHER, isPublished: true },
    });
    ids.courseOwn = courseOwn.id;
    const groupOwn = await testDb().group.create({
      data: { name: `PG-own-${run}`, courseId: courseOwn.id, branchId: branch.id },
    });
    await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: courseOwn.id, groupId: groupOwn.id } });

    // ─── Курс "Подмена": педагог курса — другой человек, а группу ведёт
    // groupTeacher — доступ у него по первому звену лестницы ──────────────
    const courseSub = await testDb().course.create({
      data: { slug: `progress-sub-${run}`, title: "Курс подмены", teacherId: ids.otherCourseTeacher, isPublished: true },
    });
    ids.courseSub = courseSub.id;
    const groupSub = await testDb().group.create({
      data: { name: `PG-sub-${run}`, courseId: courseSub.id, branchId: branch.id, teacherId: ids.groupTeacher },
    });
    await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: courseSub.id, groupId: groupSub.id } });
    // Тому же курсу подмены — занятие текущего месяца, чтобы groupTeacher
    // видел непустые данные именно по своему курсу
    const subSession = await testDb().attendanceSession.create({
      data: { courseId: courseSub.id, groupId: groupSub.id, date: sessionDate(month, 5) },
    });
    await testDb().attendanceRecord.create({
      data: { sessionId: subSession.id, studentId: ids.STUDENT, status: "PRESENT" },
    });

    // ─── Посещаемость courseOwn: 4 занятия текущего месяца — по одному на
    // каждый статус, плюс одно занятие прошлого месяца (не должно попасть
    // в выборку по умолчанию) ───────────────────────────────────────────
    const statuses = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
    for (const [index, status] of statuses.entries()) {
      const session = await testDb().attendanceSession.create({
        data: { courseId: courseOwn.id, groupId: groupOwn.id, date: sessionDate(month, index + 1) },
      });
      await testDb().attendanceRecord.create({ data: { sessionId: session.id, studentId: ids.STUDENT, status } });
    }
    const pastSession = await testDb().attendanceSession.create({
      data: { courseId: courseOwn.id, groupId: groupOwn.id, date: sessionDate(prevMonth, 15) },
    });
    await testDb().attendanceRecord.create({
      data: { sessionId: pastSession.id, studentId: ids.STUDENT, status: "PRESENT" },
    });

    // ─── Домашние задания courseOwn: сдано+проверено, сдано, но на проверке
    // (не входит в средний процент), просрочено без сдачи, срок ещё не настал ──
    const lesson = await testDb().lesson.create({
      data: { slug: `progress-lesson-${run}`, title: "Урок 1", courseId: courseOwn.id, isPublished: true, sortOrder: 1 },
    });
    ids.lesson = lesson.id;
    const lesson2 = await testDb().lesson.create({
      data: { slug: `progress-lesson2-${run}`, title: "Урок 2", courseId: courseOwn.id, isPublished: true, sortOrder: 2 },
    });
    const lesson3 = await testDb().lesson.create({
      data: { slug: `progress-lesson3-${run}`, title: "Урок 3", courseId: courseOwn.id, isPublished: true, sortOrder: 3 },
    });

    const hwGraded = await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-graded-${run}`,
        title: "Проверенное задание",
        description: "",
        type: "FILE",
        isPublished: true,
        dueDate: new Date(Date.now() - 5 * 86_400_000),
      },
    });
    await testDb().submission.create({
      data: {
        homeworkId: hwGraded.id,
        studentId: ids.STUDENT,
        code: "решение",
        status: "PASSED",
        score: 80,
        maxScore: 100,
        percentage: 80,
        attemptNumber: 1,
      },
    });

    const hwPendingReview = await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-pending-${run}`,
        title: "На проверке",
        description: "",
        type: "TEXT",
        isPublished: true,
        requiresManualReview: true,
        dueDate: new Date(Date.now() - 5 * 86_400_000),
      },
    });
    await testDb().submission.create({
      data: {
        homeworkId: hwPendingReview.id,
        studentId: ids.STUDENT,
        code: "ответ текстом",
        status: "PENDING",
        manualStatus: "PENDING",
        attemptNumber: 1,
      },
    });

    // На доработку без выставленного балла: reviewed=true (решение принято),
    // но percent должен остаться null — иначе submission.percentage=0 (для
    // ручной проверки автопроверки не было) выглядело бы как «двойка»
    const hwRevision = await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-revision-${run}`,
        title: "На доработку",
        description: "",
        type: "TEXT",
        isPublished: true,
        requiresManualReview: true,
        dueDate: new Date(Date.now() - 5 * 86_400_000),
      },
    });
    await testDb().submission.create({
      data: {
        homeworkId: hwRevision.id,
        studentId: ids.STUDENT,
        code: "черновик",
        status: "PENDING",
        manualStatus: "REVISION",
        teacherComment: "Перепишите вывод",
        attemptNumber: 1,
      },
    });

    await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-missed-${run}`,
        title: "Пропущенное",
        description: "",
        type: "FILE",
        isPublished: true,
        dueDate: new Date(Date.now() - 5 * 86_400_000),
      },
    });

    await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-future-${run}`,
        title: "Срок не настал",
        description: "",
        type: "FILE",
        isPublished: true,
        dueDate: new Date(Date.now() + 20 * 86_400_000),
      },
    });

    // Задание в Корзине (урок удалён) — не должно попасть в ответ вовсе
    const trashedLesson = await testDb().lesson.create({
      data: {
        slug: `progress-trashed-${run}`,
        title: "Удалённый урок",
        courseId: courseOwn.id,
        isPublished: true,
        deletedAt: new Date(),
      },
    });
    await testDb().homework.create({
      data: {
        lessonId: trashedLesson.id,
        slug: `hw-trashed-${run}`,
        title: "Задание из Корзины",
        description: "",
        type: "FILE",
        isPublished: true,
      },
    });

    // ─── Тесты courseOwn: TEST с двумя попытками (лучшая 90), EXAM с одной (70) ──
    const test1 = await testDb().assessment.create({
      data: { type: "TEST", title: "Промежуточный тест", courseId: courseOwn.id, isPublished: true },
    });
    await testDb().assessmentAttempt.create({
      data: { assessmentId: test1.id, studentId: ids.STUDENT, attemptNumber: 1, percentage: 60, completedAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    await testDb().assessmentAttempt.create({
      data: { assessmentId: test1.id, studentId: ids.STUDENT, attemptNumber: 2, percentage: 90, completedAt: new Date(Date.now() - 1 * 86_400_000) },
    });
    // Незавершённая попытка — не должна учитываться
    await testDb().assessmentAttempt.create({
      data: { assessmentId: test1.id, studentId: ids.STUDENT, attemptNumber: 3 },
    });

    const exam1 = await testDb().assessment.create({
      data: { type: "EXAM", title: "Экзамен", courseId: courseOwn.id, isPublished: true },
    });
    await testDb().assessmentAttempt.create({
      data: { assessmentId: exam1.id, studentId: ids.STUDENT, attemptNumber: 1, percentage: 70, completedAt: new Date() },
    });

    // ─── Прогресс по урокам courseOwn: 2 из 3 опубликованных пройдены ──────
    await testDb().lessonProgress.create({ data: { studentId: ids.STUDENT, lessonId: lesson.id, completedAt: new Date() } });
    await testDb().lessonProgress.create({ data: { studentId: ids.STUDENT, lessonId: lesson2.id, completedAt: new Date() } });
    await testDb().lessonProgress.create({ data: { studentId: ids.STUDENT, lessonId: lesson3.id, completedAt: null } });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, role?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v2${path}`);
    return role ? req.set("Cookie", cookies[role]) : req;
  };

  it("без входа — 401", async () => {
    expect((await get(`/progress/students/${ids.STUDENT}`)).status).toBe(401);
  });

  it("ученик видит свою успеваемость", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}`, "STUDENT");
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(month);
    expect(res.body.courses).toHaveLength(2);

    const own = res.body.courses.find((c: { course: { id: string } }) => c.course.id === ids.courseOwn);
    expect(own.attendance).toMatchObject({ total: 4, present: 1, late: 1, absent: 1, excused: 1, percent: 50 });
    expect(own.attendance.absentDates).toHaveLength(1);

    expect(own.homework.total).toBe(5);
    expect(own.homework.done).toBe(3);
    expect(own.homework.avgPercent).toBe(80);
    const missed = own.homework.items.find((i: { slug: string }) => i.slug === `hw-missed-${run}`);
    expect(missed.submitted).toBe(false);
    expect(missed.missed).toBe(true);
    const future = own.homework.items.find((i: { slug: string }) => i.slug === `hw-future-${run}`);
    expect(future.missed).toBe(false);
    const pending = own.homework.items.find((i: { slug: string }) => i.slug === `hw-pending-${run}`);
    expect(pending.submitted).toBe(true);
    expect(pending.reviewed).toBe(false);
    expect(pending.percent).toBeNull();
    // На доработку: решение принято (reviewed), но балла нет — percent
    // остаётся null и в средний процент не попадает (иначе было бы 0%)
    const revision = own.homework.items.find((i: { slug: string }) => i.slug === `hw-revision-${run}`);
    expect(revision.submitted).toBe(true);
    expect(revision.reviewed).toBe(true);
    expect(revision.manualStatus).toBe("REVISION");
    expect(revision.percent).toBeNull();
    expect(revision.teacherComment).toBe("Перепишите вывод");
    // Задание из Корзины не показывается вовсе
    expect(own.homework.items.some((i: { slug: string }) => i.slug === `hw-trashed-${run}`)).toBe(false);

    expect(own.tests.items).toHaveLength(2);
    const bestTest = own.tests.items.find((i: { type: string }) => i.type === "TEST");
    expect(bestTest.percent).toBe(90);
    expect(bestTest.attemptsCount).toBe(2);
    const exam = own.tests.items.find((i: { type: string }) => i.type === "EXAM");
    expect(exam.percent).toBe(70);
    expect(own.tests.avgPercent).toBe(80);

    expect(own.lessons).toMatchObject({ total: 3, completed: 2 });

    // Итог по всем курсам ученика (courseOwn + courseSub)
    expect(res.body.totals.homeworkTotal).toBe(5);
    expect(res.body.totals.homeworkDone).toBe(3);
    expect(res.body.totals.homeworkAvgPercent).toBe(80);
  });

  it("ученик не получает чужую успеваемость: чужой id — 404", async () => {
    const res = await get(`/progress/students/${ids.otherStudent}`, "STUDENT");
    expect(res.status).toBe(404);
  });

  it("прошлый месяц запрашивается явно, а по умолчанию не подмешивается", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}?month=${prevMonth}`, "STUDENT");
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(prevMonth);
    const own = res.body.courses.find((c: { course: { id: string } }) => c.course.id === ids.courseOwn);
    expect(own.attendance).toMatchObject({ total: 1, present: 1, percent: 100 });
  });

  it("родитель видит своего ребёнка и не видит чужого", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}`, "PARENT");
    expect(res.status).toBe(200);
    expect(res.body.student.id).toBe(ids.STUDENT);
    expect(res.body.courses).toHaveLength(2);

    const forbidden = await get(`/progress/students/${ids.otherStudent}`, "PARENT");
    expect(forbidden.status).toBe(404);
  });

  it("родитель другого ребёнка не видит этого ученика", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}`, "otherParent");
    expect(res.status).toBe(404);
  });

  it("администратор видит любого ученика целиком", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}`, "ADMIN");
    expect(res.status).toBe(200);
    expect(res.body.courses).toHaveLength(2);
  });

  it("педагог курса видит ученика только по своему курсу", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}`, "TEACHER");
    expect(res.status).toBe(200);
    expect(res.body.courses).toHaveLength(1);
    expect(res.body.courses[0].course.id).toBe(ids.courseOwn);
  });

  it("педагог группы (без курса) видит ученика только по своей группе", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}`, "groupTeacher");
    expect(res.status).toBe(200);
    expect(res.body.courses).toHaveLength(1);
    expect(res.body.courses[0].course.id).toBe(ids.courseSub);
  });

  it("посторонний преподаватель ученика не находит", async () => {
    const res = await get(`/progress/students/${ids.STUDENT}`, "stranger");
    expect(res.status).toBe(404);
  });
});
