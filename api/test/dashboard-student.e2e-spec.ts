import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentDateKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, testDb, type TestApp } from "./helpers";

// Дашборд ученика и родителя (раздел 3 плана главной панели): баланс — ТОЛЬКО
// через BillingService.studentBilling (сверяем с ответом администратора),
// следующее занятие — по расписанию группы, задания со сроком — только
// несданные. Всё своё — в отдельном филиале, чтобы не зависеть от данных
// других файлов тестов.
describe("дашборд ученика и родителя", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);
  const today = currentDateKey();
  // Расписание на все дни недели — «следующее занятие» гарантированно
  // сегодня, тест не зависит от того, в какой день недели он запущен
  const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

  beforeAll(async () => {
    app = await createTestApp();

    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user);
    }
    // Второй ученик и родитель — проверить, что родитель не видит чужого ребёнка
    const otherStudent = await createUser({ role: "STUDENT" });
    ids.otherStudent = otherStudent.id;
    const otherParent = await createUser({ role: "PARENT" });
    ids.otherParent = otherParent.id;
    cookies.otherParent = await sessionCookie(otherParent);
    await testDb().parentStudent.create({
      data: { parentId: otherParent.id, studentId: otherStudent.id, relation: "OTHER" },
    });

    await testDb().parentStudent.create({
      data: { parentId: ids.PARENT, studentId: ids.STUDENT, relation: "MOTHER" },
    });

    const branch = await createBranch(`Дашборд-ученика-${run}`);
    ids.branch = branch.id;

    const course = await testDb().course.create({
      data: { slug: `student-dash-${run}`, title: "Курс дашборда", teacherId: ids.TEACHER, isPublished: true },
    });
    ids.course = course.id;

    // Группа началась два месяца назад, занимается каждый день недели —
    // долг за прошлые месяцы гарантирован (оплат нет), а следующее занятие
    // всегда «сегодня»
    const start = new Date(Date.now() - 60 * 86_400_000);
    const group = await testDb().group.create({
      data: {
        name: `SD-${run}`,
        courseId: course.id,
        branchId: branch.id,
        scheduleDays: EVERY_DAY,
        schedule: "Пн–Вс 10:00",
        price: 400_000,
        startDate: start,
      },
    });
    ids.group = group.id;

    await testDb().enrollment.create({
      data: { studentId: ids.STUDENT, courseId: course.id, groupId: group.id, startsAt: start },
    });

    const lesson = await testDb().lesson.create({
      data: { slug: `urok-sd-${run}`, title: "Урок", courseId: course.id, isPublished: true },
    });
    ids.lesson = lesson.id;

    // Срок — через три дня: заведомо «сегодня или позже» в любой таймзоне
    const dueDate = new Date(Date.now() + 3 * 86_400_000);

    const homeworkOpen = await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-open-${run}`,
        title: "Несданное задание",
        description: "",
        type: "FILE",
        isPublished: true,
        dueDate,
      },
    });
    ids.homeworkOpen = homeworkOpen.id;

    const homeworkDone = await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-done-${run}`,
        title: "Сданное задание",
        description: "",
        type: "FILE",
        isPublished: true,
        dueDate,
      },
    });
    await testDb().submission.create({
      data: {
        homeworkId: homeworkDone.id,
        studentId: ids.STUDENT,
        code: "сдано",
        attemptNumber: 1,
      },
    });

    // Задание с прошедшим сроком — напоминание про него не нужно
    await testDb().homework.create({
      data: {
        lessonId: lesson.id,
        slug: `hw-past-${run}`,
        title: "Просроченное задание",
        description: "",
        type: "FILE",
        isPublished: true,
        dueDate: new Date(Date.now() - 10 * 86_400_000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, role?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v2${path}`);
    return role ? req.set("Cookie", cookies[role]) : req;
  };

  it("ученик видит свой баланс, следующее занятие и несданное задание со сроком", async () => {
    const res = await get("/dashboard/student", "STUDENT");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("STUDENT");

    // Баланс совпадает с тем, что видит администратор на карточке студента
    const adminView = await get(`/billing/students/${ids.STUDENT}`, "ADMIN");
    expect(adminView.status).toBe(200);
    expect(res.body.billing.balance).toBe(adminView.body.totals.balance);
    expect(res.body.billing.prepaidFuture).toBe(adminView.body.totals.prepaidFuture);
    expect(res.body.billing.courses).toHaveLength(1);
    expect(res.body.billing.courses[0]).toMatchObject({
      courseId: ids.course,
      groupName: `SD-${run}`,
      monthlyPrice: 400_000,
    });
    // Долг за два месяца без оплат — баланс отрицательный
    expect(res.body.billing.balance).toBeLessThan(0);

    // Следующее занятие — сегодня по Ташкенту: расписание на каждый день
    expect(res.body.nextLessons).toHaveLength(1);
    expect(res.body.nextLessons[0]).toMatchObject({
      groupId: ids.group,
      groupName: `SD-${run}`,
      courseTitle: "Курс дашборда",
      date: today,
      schedule: "Пн–Вс 10:00",
    });

    // Только несданное задание с будущим сроком; сданное и просроченное — нет
    expect(res.body.homeworks).toHaveLength(1);
    expect(res.body.homeworks[0]).toMatchObject({
      id: ids.homeworkOpen,
      courseSlug: `student-dash-${run}`,
      lessonSlug: `urok-sd-${run}`,
    });
  });

  it("родитель видит своего ребёнка и не видит чужого", async () => {
    const res = await get("/dashboard/student", "PARENT");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("PARENT");
    expect(res.body.children).toHaveLength(1);

    const child = res.body.children[0];
    expect(child.studentId).toBe(ids.STUDENT);
    expect(child.billing.balance).toBeLessThan(0);
    expect(child.nextLessons).toHaveLength(1);
    expect(child.homeworks).toHaveLength(1);

    // Родитель другого ребёнка не видит студента этого теста
    const otherRes = await get("/dashboard/student", "otherParent");
    expect(otherRes.status).toBe(200);
    const otherIds = otherRes.body.children.map((c: { studentId: string }) => c.studentId);
    expect(otherIds).not.toContain(ids.STUDENT);
  });

  it("родитель без привязанных детей получает пустой список", async () => {
    const parent = await createUser({ role: "PARENT" });
    const cookie = await sessionCookie(parent);
    const res = await request(app.getHttpServer())
      .get("/api/v2/dashboard/student")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.children).toEqual([]);
  });

  it("персоналу дашборд ученика не отдаётся", async () => {
    expect((await get("/dashboard/student", "TEACHER")).status).toBe(403);
    expect((await get("/dashboard/student", "ADMIN")).status).toBe(403);
  });

  it("без входа — 401", async () => {
    expect((await get("/dashboard/student")).status).toBe(401);
  });
});
