import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthKey } from "../src/modules/billing/domain/billing";
import { createBranch, createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("модуль courses", () => {
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
    const otherTeacher = await createUser({ role: "TEACHER" });
    ids.otherTeacher = otherTeacher.id;
    cookies.otherTeacher = await sessionCookie(otherTeacher, { roleInToken: "TEACHER" });

    const own = await testDb().course.create({
      data: { slug: `own-${run}`, title: "Свой курс", teacherId: ids.TEACHER, isPublished: true, price: 500000 },
    });
    ids.own = own.id;
    const foreign = await testDb().course.create({
      data: { slug: `foreign-${run}`, title: "Чужой курс", teacherId: ids.otherTeacher, isPublished: true },
    });
    ids.foreign = foreign.id;
    const draft = await testDb().course.create({
      data: { slug: `draft-${run}`, title: "Черновик", teacherId: ids.TEACHER },
    });
    ids.draft = draft.id;

    await testDb().enrollment.create({ data: { studentId: ids.STUDENT, courseId: own.id } });
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

  describe("что видно в списке", () => {
    it("администратор видит и чужие, и черновики", async () => {
      const res = await get("/courses", "ADMIN");
      const titles = res.body.map((c: { id: string }) => c.id);
      expect(titles).toEqual(expect.arrayContaining([ids.own, ids.foreign, ids.draft]));
    });

    it("преподаватель видит только свои", async () => {
      const res = await get("/courses", "TEACHER");
      const listed = res.body.map((c: { id: string }) => c.id);
      expect(listed).toEqual(expect.arrayContaining([ids.own, ids.draft]));
      expect(listed).not.toContain(ids.foreign);
    });

    it("ученик видит только опубликованные курсы, на которые записан", async () => {
      const res = await get("/courses", "STUDENT");
      expect(res.body.map((c: { id: string }) => c.id)).toEqual([ids.own]);
    });

    it("родитель не видит курсов", async () => {
      expect((await get("/courses", "PARENT")).body).toEqual([]);
    });

    it("аноним — 401", async () => {
      expect((await get("/courses")).status).toBe(401);
    });
  });

  describe("доступ к курсу по id (аудит 2.3)", () => {
    it("ученик открывает свой курс и не открывает чужой или черновик", async () => {
      expect((await get(`/courses/${ids.own}`, "STUDENT")).status).toBe(200);
      expect((await get(`/courses/${ids.foreign}`, "STUDENT")).status).toBe(404);
      expect((await get(`/courses/${ids.draft}`, "STUDENT")).status).toBe(404);
    });

    it("родитель курс не открывает", async () => {
      expect((await get(`/courses/${ids.own}`, "PARENT")).status).toBe(404);
    });

    it("преподаватель открывает чужой курс: подмены разрешены владельцем", async () => {
      expect((await get(`/courses/${ids.foreign}`, "TEACHER")).status).toBe(200);
    });

    it("slug → id работает по тем же правам", async () => {
      expect((await get(`/courses/slug/own-${run}`, "STUDENT")).body).toEqual({ id: ids.own });
      expect((await get(`/courses/slug/draft-${run}`, "STUDENT")).status).toBe(404);
    });
  });

  describe("создание и изменение", () => {
    it("ученик и родитель не создают курсы", async () => {
      for (const role of ["STUDENT", "PARENT"]) {
        const res = await send("post", "/courses", role, { title: "Х", teacherId: ids.TEACHER });
        expect(res.status, role).toBe(403);
      }
    });

    it("преподаватель заводит курс только на себя", async () => {
      const foreignOwner = await send("post", "/courses", "TEACHER", {
        title: "Не мой",
        teacherId: ids.otherTeacher,
      });
      expect(foreignOwner.status).toBe(400);
      expect(foreignOwner.body.message).toBe("onlyOwnCourses");

      const mine = await send("post", "/courses", "TEACHER", { title: "Мой новый", teacherId: ids.TEACHER });
      expect(mine.status).toBe(201);
      expect(mine.body.slug).toMatch(/^moy-novyy/);
    });

    it("администратор заводит курс любому преподавателю", async () => {
      const res = await send("post", "/courses", "ADMIN", {
        title: "Курс от админа",
        teacherId: ids.otherTeacher,
      });
      expect(res.status).toBe(201);
    });

    it("преподаватель не меняет и не удаляет чужой курс", async () => {
      expect((await send("patch", `/courses/${ids.foreign}`, "TEACHER", { title: "Взлом" })).status).toBe(404);
      expect((await send("delete", `/courses/${ids.foreign}`, "TEACHER")).status).toBe(404);
    });

    it("название меняет slug, изменение попадает в журнал", async () => {
      const res = await send("patch", `/courses/${ids.draft}`, "TEACHER", { title: "Переименован" });
      expect(res.status).toBe(200);
      expect(res.body.slug).toMatch(/^pereimenovan/);

      const log = await testDb().auditLog.findFirst({
        where: { entityType: "Course", entityId: ids.draft, action: "UPDATE" },
      });
      expect(log?.changes).toMatchObject({ title: { new: "Переименован" } });
    });

    it("удаление мягкое: курс уходит в Корзину", async () => {
      const course = await testDb().course.create({
        data: { slug: `trash-${run}`, title: "В корзину", teacherId: ids.TEACHER },
      });
      expect((await send("delete", `/courses/${course.id}`, "TEACHER")).status).toBe(200);
      // Строка остаётся, но с deletedAt: курс в Корзине, уроки и оплаты целы
      const row = await testDb().course.findUnique({ where: { id: course.id } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
      // И в списке его больше нет
      const listed = await get("/courses", "TEACHER");
      expect(listed.body.map((c: { id: string }) => c.id)).not.toContain(course.id);
    });
  });

  describe("смена цены и начисления", () => {
    it("перед сменой цены закрытые месяцы фиксируются по старой", async () => {
      const student = await createUser({ role: "STUDENT" });
      const branch = await createBranch();
      const group = await testDb().group.create({
        data: { name: `pricing-${run}`, courseId: ids.own, scheduleDays: [1, 3, 5], branchId: branch.id },
      });
      const enrollment = await testDb().enrollment.create({
        data: {
          studentId: student.id,
          courseId: ids.own,
          groupId: group.id,
          startsAt: new Date(Date.now() - 90 * 24 * 3600 * 1000),
        },
      });

      const res = await send("patch", `/courses/${ids.own}`, "ADMIN", { price: 900000 });
      expect(res.status).toBe(200);

      const frozen = await testDb().monthlyCharge.findMany({ where: { enrollmentId: enrollment.id } });
      expect(frozen.length).toBeGreaterThan(0);
      // Прошлое осталось по старой цене курса, а не по новой
      expect(frozen.every((row) => row.priceUsed === 500000)).toBe(true);
    });

    // Правка «смена цены курса не замораживает зарплату»: цена курса — вход
    // расчёта зарплаты ровно так же, как цена группы (база для групп без
    // своей цены), поэтому CoursesService.update() обязан звать
    // SalaryService.freezeClosedMonths СТРОГО ПОСЛЕ биллинговой заморозки —
    // иначе правка цены задним числом увела бы зарплату за закрытый, но ещё
    // не замороженный месяц (тот самый риск, от которого защищает реестр).
    it("перед сменой цены закрытый месяц зарплаты по группам курса тоже фиксируется, по старой базе биллинга", async () => {
      const teacher = await createUser({ role: "TEACHER" });
      const student = await createUser({ role: "STUDENT" });
      const branch = await createBranch();
      const course = await testDb().course.create({
        data: { slug: `salary-freeze-${run}`, title: "Курс — заморозка зарплаты", teacherId: teacher.id, price: 400000 },
      });
      const group = await testDb().group.create({
        data: {
          name: `salary-freeze-${run}`,
          courseId: course.id,
          branchId: branch.id,
          scheduleDays: [1, 3, 5],
          teacherId: teacher.id,
          salaryPercentBp: 5000,
        },
      });
      const enrollment = await testDb().enrollment.create({
        data: {
          studentId: student.id,
          courseId: course.id,
          groupId: group.id,
          startsAt: new Date(Date.now() - 90 * 24 * 3600 * 1000),
        },
      });

      // До смены цены зарплатных начислений по курсу ещё нет — заморозка ленивая
      expect(await testDb().teacherSalaryAccrual.count({ where: { courseId: course.id } })).toBe(0);

      const res = await send("patch", `/courses/${course.id}`, "ADMIN", { price: 900000 });
      expect(res.status).toBe(200);

      const frozenSalary = await testDb().teacherSalaryAccrual.findMany({
        where: { courseId: course.id, groupId: group.id },
      });
      expect(frozenSalary.length).toBeGreaterThan(0);
      expect(frozenSalary.every((row) => row.lockedAt !== null)).toBe(true);

      // Заморозка зарплаты идёт СТРОГО ПОСЛЕ биллинговой и берёт базу из уже
      // зафиксированных начислений — база зарплаты за каждый месяц должна
      // совпасть с тем, что биллинг зафиксировал по СТАРОЙ цене (400000)
      const charges = await testDb().monthlyCharge.findMany({ where: { enrollmentId: enrollment.id } });
      expect(charges.length).toBeGreaterThan(0);
      expect(charges.every((c) => c.priceUsed === 400000)).toBe(true);
      for (const row of frozenSalary) {
        const charge = charges.find((c) => c.month === row.month);
        expect(charge).toBeDefined();
        expect(row.base).toBe(charge!.amount);
      }
    });
  });

  describe("записи на курс", () => {
    // Запись и отчисление ученика больше не идут через маршрут курса
    // (план «Учеников добавляют только в группу», этап 5-бис) — этим управляет
    // групповой экран (GroupsService.addStudents/removeStudent), где то же
    // поведение (повтор после отчисления, сохранение истории, заморозка
    // закрытых месяцев) покрыто test/groups.e2e-spec.ts. Здесь остаётся
    // только чтение состава — оно нужно и журналу посещаемости.
    it("контакты записанных — только персоналу", async () => {
      expect((await get(`/courses/${ids.own}/students`, "ADMIN")).status).toBe(200);
      expect((await get(`/courses/${ids.own}/students`, "TEACHER")).status).toBe(200);
      expect((await get(`/courses/${ids.own}/students`, "STUDENT")).status).toBe(403);
    });

    it("пауза (billingEndsAt без отчисления) не отбирает доступ и не выкидывает из списка учеников", async () => {
      // ids.STUDENT записан на ids.own без группы с самого beforeAll —
      // обычное активное состояние «ученик без группы», не отчисление
      const enrollment = await testDb().enrollment.findUniqueOrThrow({
        where: { studentId_courseId: { studentId: ids.STUDENT, courseId: ids.own } },
      });
      expect(enrollment.groupId).toBeNull();
      expect(enrollment.unenrolledAt).toBeNull();

      // Админ ставит дату отчисления только как паузу в начислениях —
      // без намерения отчислять (тот самый диалог должников, а не кнопка
      // «Отчислить»): unenrolledAt при этом не трогается
      const paused = await send("patch", `/billing/enrollments/${enrollment.id}`, "ADMIN", {
        billingEndsAt: `${current}-01`,
      });
      expect(paused.status).toBe(200);

      const row = await testDb().enrollment.findUnique({ where: { id: enrollment.id } });
      expect(row?.billingEndsAt).not.toBeNull();
      expect(row?.unenrolledAt).toBeNull();

      // Доступ к курсу не пропал — пауза не отчисление
      expect((await get(`/courses/${ids.own}`, "STUDENT")).status).toBe(200);

      // И в списке учеников курса студент остаётся
      const roster = await get(`/courses/${ids.own}/students`, "ADMIN");
      expect(roster.status).toBe(200);
      expect(roster.body.map((s: { id: string }) => s.id)).toContain(ids.STUDENT);

      // Убираем паузу, чтобы не мешать остальным тестам файла. Пустое значение —
      // это отсутствие ключа (DTO: "optional, а не nullable"), а не "": сервис
      // безусловно перезаписывает и startsAt/billingEndsAt на null, когда их
      // нет в теле — у ids.STUDENT они и так не выставлены, поэтому это безопасно
      await send("patch", `/billing/enrollments/${enrollment.id}`, "ADMIN", {});
    });
  });
});
