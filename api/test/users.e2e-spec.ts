import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  createUser,
  sessionCookie,
  TEST_APP_URL,
  testDb,
  type TestApp,
} from "./helpers";

describe("модуль users", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      ids[role] = user.id;
      cookies[role] = await sessionCookie(user, { roleInToken: role });
    }
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

  // Тесты делят одну базу (vitest.config.mts: fileParallelism: false) —
  // логины и имена курсов/групп/филиалов должны быть уникальны между собой.
  // Логин ограничен 30 символами (LOGIN_REGEX) — базу обрезаем, чтобы влезть
  // вместе со счётчиком.
  let uniqueCounter = 0;
  const uniqueLogin = (base: string) => `${base.slice(0, 20)}${uniqueCounter++}`;
  const uniqueName = (base: string) => `${base}-${Date.now().toString(36)}-${uniqueCounter++}`;

  describe("матрица ролей", () => {
    const matrix: Array<[string, string, string, number]> = [
      ["GET", "/users", "ADMIN", 200],
      ["GET", "/users", "TEACHER", 200],
      ["GET", "/users", "STUDENT", 403],
      ["GET", "/users", "PARENT", 403],
      ["GET", "/users/teachers", "ADMIN", 200],
      ["GET", "/users/teachers", "TEACHER", 403],
      ["GET", "/users/deactivated", "ADMIN", 200],
      ["GET", "/users/deactivated", "TEACHER", 403],
      ["GET", "/users/statistics/homework", "ADMIN", 200],
      ["GET", "/users/statistics/homework", "TEACHER", 200],
      ["GET", "/users/statistics/homework", "STUDENT", 403],
      ["GET", "/audit-log", "ADMIN", 200],
      ["GET", "/audit-log", "TEACHER", 403],
    ];

    it.each(matrix)("%s %s под ролью %s → %i", async (_method, path, role, expected) => {
      expect((await get(path, role)).status).toBe(expected);
    });

    it("аноним не проходит дальше 401", async () => {
      expect((await get("/users")).status).toBe(401);
    });

    it("преподаватель видит только учеников и себя", async () => {
      const res = await get("/users", "TEACHER");
      const roles = new Set(res.body.map((u: { role: string }) => u.role));
      expect([...roles].sort()).toEqual(["STUDENT", "TEACHER"]);
      expect(res.body.filter((u: { role: string }) => u.role === "TEACHER")).toEqual([
        expect.objectContaining({ id: ids.TEACHER }),
      ]);
    });

    it("администратор видит все роли", async () => {
      const res = await get("/users", "ADMIN");
      const roles = new Set(res.body.map((u: { role: string }) => u.role));
      expect(roles).toContain("PARENT");
      expect(roles).toContain("ADMIN");
    });

    it.each(["TEACHER", "STUDENT", "PARENT"])("%s не может создать пользователя", async (role) => {
      const res = await send("post", "/users", role, {
        password: "12345678",
        firstName: "X",
        lastName: "Y",
        role: "STUDENT",
      });
      expect(res.status).toBe(403);
    });

    it.each(["TEACHER", "STUDENT"])("%s не может менять и удалять чужого", async (role) => {
      expect((await send("patch", `/users/${ids.STUDENT}`, role, { firstName: "Z" })).status).toBe(403);
      expect((await send("delete", `/users/${ids.STUDENT}`, role)).status).toBe(403);
    });
  });

  describe("чужой id — 404, а не 403", () => {
    it("ученик читает себя, но не другого", async () => {
      expect((await get(`/users/${ids.STUDENT}`, "STUDENT")).status).toBe(200);
      const res = await get(`/users/${ids.TEACHER}`, "STUDENT");
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("userNotFound");
    });

    it("родитель не читает чужого", async () => {
      expect((await get(`/users/${ids.STUDENT}`, "PARENT")).status).toBe(404);
    });

    it("преподаватель читает ученика, но не другого преподавателя", async () => {
      const otherTeacher = await createUser({ role: "TEACHER" });
      expect((await get(`/users/${ids.STUDENT}`, "TEACHER")).status).toBe(200);
      expect((await get(`/users/${otherTeacher.id}`, "TEACHER")).status).toBe(404);
    });

    it("несуществующий id — 404", async () => {
      expect((await get("/users/no-such-id", "ADMIN")).status).toBe(404);
    });
  });

  describe("создание и изменение (аудит 1.3 — схемы выполняются на сервере)", () => {
    it("короткий пароль не проходит", async () => {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("short-pass"),
        password: "short",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: branch.id,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("validationFailed");
      expect(res.body.details.map((d: { path: string[] }) => d.path)).toContainEqual(["password"]);
    });

    it("роль вне списка не проходит", async () => {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("bad-role"),
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "SUPERUSER",
        branchId: branch.id,
      });
      expect(res.status).toBe(400);
    });

    it("без филиала — 400: обязателен при создании (4.3)", async () => {
      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("no-branch"),
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("validationFailed");
      expect(res.body.details.map((d: { path: string[] }) => d.path)).toContainEqual(["branchId"]);
    });

    it("логин без формата (заглавные, пробелы, короче 3 символов) не проходит", async () => {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const res = await send("post", "/users", "ADMIN", {
        login: "AB",
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: branch.id,
      });
      expect(res.status).toBe(400);
      expect(res.body.details.map((d: { path: string[] }) => d.path)).toContainEqual(["login"]);
    });

    it("лишние поля отбрасываются, пользователь создаётся", async () => {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const login = uniqueLogin("novyy-polzovatel");
      const res = await send("post", "/users", "ADMIN", {
        login,
        // Почты в схеме больше нет вовсе (шаг 2 отказа от почты) — лишнее
        // поле должно молча отбрасываться, а не валить запрос
        email: "should-be-ignored@test.uz",
        password: "12345678",
        firstName: "Имя",
        lastName: "Фамилия",
        role: "STUDENT",
        branchId: branch.id,
        isActive: false,
        number: 99999,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ login, role: "STUDENT", isActive: true });
      expect(res.body.number).not.toBe(99999);
      expect(res.body.email).toBeUndefined();
    });

    it("занятый логин — 409 loginExists", async () => {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const login = uniqueLogin("dubl");
      const first = await send("post", "/users", "ADMIN", {
        login,
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: branch.id,
      });
      expect(first.status).toBe(201);

      const res = await send("post", "/users", "ADMIN", {
        login,
        password: "12345678",
        firstName: "C",
        lastName: "D",
        role: "STUDENT",
        branchId: branch.id,
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("loginExists");
    });

    it("логин мягко удалённого пользователя остаётся занятым", async () => {
      const login = uniqueLogin("byvshiy");
      await createUser({ role: "STUDENT", deletedAt: new Date(), login });
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const res = await send("post", "/users", "ADMIN", {
        login,
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: branch.id,
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("loginExists");
    });

    it("изменение пишется в журнал аудита", async () => {
      const target = await createUser({ role: "STUDENT" });
      const res = await send("patch", `/users/${target.id}`, "ADMIN", { firstName: "Новое" });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe("Новое");

      const log = await testDb().auditLog.findFirst({
        where: { entityType: "User", entityId: target.id, action: "UPDATE" },
      });
      expect(log?.changes).toMatchObject({ firstName: { new: "Новое" } });
    });
  });

  describe("сброс пароля администратором (4.1, «Путь 1»)", () => {
    it("PATCH с password меняет хэш, сбрасывает кэш и рвёт сессии", async () => {
      const target = await createUser({ role: "STUDENT", password: "staryy-parol-123" });
      const cookie = await sessionCookie(target);
      expect((await http().get("/api/v2/me").set("Cookie", cookie)).status).toBe(200);

      const res = await send("patch", `/users/${target.id}`, "ADMIN", { password: "novyy-parol-ot-admina" });
      expect(res.status).toBe(200);

      // Прежняя сессия оборвана — как при деактивации (аудит 2.1)
      expect((await http().get("/api/v2/me").set("Cookie", cookie)).status).toBe(401);

      const row = await testDb().user.findUnique({ where: { id: target.id }, select: { passwordHash: true } });
      expect(row?.passwordHash).not.toBeNull();

      // В аудит пароль попадает замаскированным, а не текстом
      const log = await testDb().auditLog.findFirst({
        where: { entityType: "User", entityId: target.id, action: "UPDATE" },
        orderBy: { createdAt: "desc" },
      });
      expect(log?.changes).toMatchObject({ password: { new: "***" } });
    });
  });

  describe("подсказка и проверка занятости логина", () => {
    it("login-suggestion предлагает свободный логин из имени и фамилии", async () => {
      const res = await send("post", "/users/login-suggestion", "ADMIN", {
        firstName: "Иван",
        lastName: "Иванов",
      });
      expect(res.status).toBe(201);
      expect(res.body.login).toMatch(/^[a-z0-9][a-z0-9._-]{2,29}$/);
    });

    it("login-available отвечает false на занятый и true на свободный", async () => {
      const login = uniqueLogin("zanyat");
      await createUser({ role: "STUDENT", login });

      const taken = await get(`/users/login-available?login=${login}`, "ADMIN");
      expect(taken.body).toEqual({ available: false });

      const free = await get(`/users/login-available?login=${uniqueLogin("svoboden")}`, "ADMIN");
      expect(free.body).toEqual({ available: true });
    });

    it("STUDENT не может дёргать подсказку логина — не своя привилегия создания", async () => {
      const res = await send("post", "/users/login-suggestion", "STUDENT", {
        firstName: "X",
        lastName: "Y",
      });
      expect(res.status).toBe(403);
    });
  });

  describe("филиал пользователя — справочная приписка (этап 1 плана филиалов)", () => {
    it("несуществующий филиал — 404, а не 500 от внешнего ключа", async () => {
      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("no-branch-404"),
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: "no-such-branch",
      });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("branchNotFound");
    });

    it("создание и фильтр списка по филиалу", async () => {
      const branch = await testDb().branch.create({ data: { name: `Users-${Date.now().toString(36)}` } });
      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("filialnyy"),
        password: "12345678",
        firstName: "Филиальный",
        lastName: "Ученик",
        role: "STUDENT",
        branchId: branch.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.branchId).toBe(branch.id);

      const filtered = await get(`/users?branchId=${branch.id}`, "ADMIN");
      expect(filtered.body.map((u: { id: string }) => u.id)).toContain(res.body.id);
      expect(filtered.body.every((u: { branchId: string | null }) => u.branchId === branch.id)).toBe(true);
    });

    it("PATCH пустой строкой очищает приписку к филиалу", async () => {
      const branch = await testDb().branch.create({ data: { name: `Users2-${Date.now().toString(36)}` } });
      const target = await createUser({ role: "STUDENT" });
      await testDb().user.update({ where: { id: target.id }, data: { branchId: branch.id } });

      const res = await send("patch", `/users/${target.id}`, "ADMIN", { branchId: "" });
      expect(res.status).toBe(200);
      expect(res.body.branchId).toBeNull();
    });
  });

  describe("запись на курс при создании ученика (4.4–4.6)", () => {
    async function branchCourseGroup() {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const teacher = await createUser({ role: "TEACHER" });
      const course = await testDb().course.create({
        data: { title: uniqueName("Курс"), slug: uniqueName("kurs"), teacherId: teacher.id, price: 300000 },
      });
      const group = await testDb().group.create({
        data: { name: uniqueName("Группа"), courseId: course.id, branchId: branch.id, price: 350000 },
      });
      return { branch, course, group };
    }

    it("создаёт пользователя и Enrollment одной операцией", async () => {
      const { branch, course, group } = await branchCourseGroup();

      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("s-obucheniem"),
        password: "12345678",
        firstName: "Со",
        lastName: "Обучением",
        role: "STUDENT",
        branchId: branch.id,
        enrollment: { courseId: course.id, groupId: group.id, priceOverride: 250000, startsAt: "2026-10-01" },
      });
      expect(res.status).toBe(201);
      expect(res.body.enrollmentId).toBeTruthy();

      const enrollment = await testDb().enrollment.findUnique({ where: { id: res.body.enrollmentId } });
      expect(enrollment).toMatchObject({
        studentId: res.body.id,
        courseId: course.id,
        groupId: group.id,
        priceOverride: 250000,
      });
    });

    it("блок необязателен: ученика можно завести без записи на курс", async () => {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("bez-obucheniya"),
        password: "12345678",
        firstName: "Без",
        lastName: "Обучения",
        role: "STUDENT",
        branchId: branch.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.enrollmentId ?? null).toBeNull();
    });

    it("enrollment у роли, отличной от STUDENT, — 400", async () => {
      const { branch, course } = await branchCourseGroup();
      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("prepod-s-obucheniem"),
        password: "12345678",
        firstName: "Не",
        lastName: "Ученик",
        role: "TEACHER",
        branchId: branch.id,
        enrollment: { courseId: course.id },
      });
      expect(res.status).toBe(400);
      expect(res.body.details.map((d: { path: string[] }) => d.path)).toContainEqual(["enrollment"]);
    });

    it("несуществующий курс — 404, а не 500", async () => {
      const branch = await testDb().branch.create({ data: { name: uniqueName("Branch") } });
      const login = uniqueLogin("chuzhoy-kurs");
      const res = await send("post", "/users", "ADMIN", {
        login,
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: branch.id,
        enrollment: { courseId: "no-such-course" },
      });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("courseNotFound");

      // Транзакция откатилась целиком — пользователь тоже не создан
      const created = await testDb().user.findFirst({ where: { login } });
      expect(created).toBeNull();
    });

    it("группа не принадлежит указанному курсу — 404 groupNotFound", async () => {
      const { branch, course } = await branchCourseGroup();
      // Группа существует, но у ДРУГОГО курса — courseId и groupId не согласованы
      const { group: foreignGroup } = await branchCourseGroup();

      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("nesoglasovannaya-gruppa"),
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: branch.id,
        enrollment: { courseId: course.id, groupId: foreignGroup.id },
      });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("groupNotFound");
    });

    it("группа другого филиала — 400 groupWrongBranch", async () => {
      const { course, group } = await branchCourseGroup();
      const otherBranch = await testDb().branch.create({ data: { name: uniqueName("OtherBranch") } });

      const res = await send("post", "/users", "ADMIN", {
        login: uniqueLogin("ne-tot-filial"),
        password: "12345678",
        firstName: "A",
        lastName: "B",
        role: "STUDENT",
        branchId: otherBranch.id,
        enrollment: { courseId: course.id, groupId: group.id },
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("groupWrongBranch");
    });
  });

  describe("деактивация и удаление", () => {
    it("нельзя выключить или стереть себя", async () => {
      expect((await send("post", `/users/${ids.ADMIN}/deactivate`, "ADMIN")).body.message).toBe(
        "cannotDeactivateSelf"
      );
      expect((await send("delete", `/users/${ids.ADMIN}`, "ADMIN")).body.message).toBe("cannotPurgeSelf");
    });

    it("активного нельзя стереть, деактивированного — можно", async () => {
      const target = await createUser({ role: "STUDENT" });
      expect((await send("delete", `/users/${target.id}`, "ADMIN")).body.message).toBe("userIsActive");

      expect((await send("post", `/users/${target.id}/deactivate`, "ADMIN")).status).toBe(201);
      expect((await send("delete", `/users/${target.id}`, "ADMIN")).status).toBe(200);
      expect(await testDb().user.findUnique({ where: { id: target.id } })).toBeNull();
    });

    it("восстановление возвращает в строй и снимает deletedAt", async () => {
      const target = await createUser({ role: "STUDENT", isActive: false, deletedAt: new Date() });
      expect((await send("post", `/users/${target.id}/restore`, "ADMIN")).status).toBe(201);
      const row = await testDb().user.findUnique({ where: { id: target.id } });
      expect(row).toMatchObject({ isActive: true, deletedAt: null });
    });

    // Регрессия: Payment/TeacherPayout были на ON DELETE CASCADE — удаление
    // ученика или преподавателя стирало кассу и выплаты вместе с ним
    it("ученика с оплатой стереть нельзя — оплата остаётся на месте", async () => {
      const teacher = await createUser({ role: "TEACHER" });
      const target = await createUser({ role: "STUDENT", isActive: false, deletedAt: new Date() });
      const course = await testDb().course.create({
        data: { slug: uniqueLogin("money-course"), title: "Курс с оплатой", teacherId: teacher.id },
      });
      const payment = await testDb().payment.create({
        data: { amount: 100000, paidAt: new Date(), studentId: target.id, courseId: course.id, createdById: ids.ADMIN },
      });

      const res = await send("delete", `/users/${target.id}`, "ADMIN");
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("userHasProtectedRecords");
      expect(await testDb().payment.findUnique({ where: { id: payment.id } })).not.toBeNull();
      expect(await testDb().user.findUnique({ where: { id: target.id } })).not.toBeNull();
    });

    it("преподавателя с выплатой стереть нельзя — выплата остаётся на месте", async () => {
      const teacher = await createUser({ role: "TEACHER", isActive: false, deletedAt: new Date() });
      const payout = await testDb().teacherPayout.create({
        data: { amount: 50000, paidAt: new Date(), teacherId: teacher.id, createdById: ids.ADMIN },
      });

      const res = await send("delete", `/users/${teacher.id}`, "ADMIN");
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("userHasProtectedRecords");
      expect(await testDb().teacherPayout.findUnique({ where: { id: payout.id } })).not.toBeNull();
    });
  });

  describe("регрессия аудита 2.1: деактивация действует сразу", () => {
    it("выключенный пользователь получает 401 следующим же запросом", async () => {
      const victim = await createUser({ role: "TEACHER" });
      const victimCookie = await sessionCookie(victim);
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).status).toBe(200);

      await send("post", `/users/${victim.id}/deactivate`, "ADMIN");

      // Без сброса кэша сессий он ходил бы ещё 30 секунд, а в web с JWT — 30 дней
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).status).toBe(401);
    });

    it("смена роли действует сразу", async () => {
      const victim = await createUser({ role: "TEACHER" });
      const victimCookie = await sessionCookie(victim, { roleInToken: "TEACHER" });
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).body.role).toBe("TEACHER");

      await send("patch", `/users/${victim.id}`, "ADMIN", { role: "STUDENT" });
      expect((await http().get("/api/v2/me").set("Cookie", victimCookie)).body.role).toBe("STUDENT");
    });
  });

  describe("регрессия аудита 3.7: последний администратор", () => {
    it("не может разжаловать сам себя, пока других активных нет", async () => {
      // Других администраторов в общей тестовой базе временно выключаем
      await testDb().user.updateMany({
        where: { role: "ADMIN", id: { not: ids.ADMIN } },
        data: { isActive: false },
      });

      const res = await send("patch", `/users/${ids.ADMIN}`, "ADMIN", { role: "TEACHER" });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("lastAdmin");

      const second = await createUser({ role: "ADMIN" });
      const allowed = await send("patch", `/users/${ids.ADMIN}`, "ADMIN", { role: "ADMIN" });
      expect(allowed.status).toBe(200);
      await testDb().user.delete({ where: { id: second.id } });
    });
  });

  describe("регрессия аудита 2.8: привязка Telegram", () => {
    it("новый код не трогает существующую привязку", async () => {
      const linked = await createUser({ role: "STUDENT", telegramChatId: "555000" });
      const cookie = await sessionCookie(linked);

      const first = await http()
        .post("/api/v2/me/telegram/code")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL);
      expect(first.status).toBe(201);
      expect(first.body.code).toMatch(/^[0-9a-f]{32}$/);

      const second = await http()
        .post("/api/v2/me/telegram/code")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL);
      expect(second.body.code).not.toBe(first.body.code);

      // Главное: chat id на месте, вход через Telegram не потерян
      const row = await testDb().user.findUnique({ where: { id: linked.id } });
      expect(row?.telegramChatId).toBe("555000");

      // Старый код больше не действует
      const codes = await testDb().telegramLinkRequest.findMany({ where: { userId: linked.id } });
      expect(codes.map((c) => c.code)).toEqual([second.body.code]);
      expect(codes[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

      const status = await http().get("/api/v2/me/telegram").set("Cookie", cookie);
      expect(status.body).toEqual({ isLinked: true, username: null });
    });

    it("отвязка убирает chat id и коды", async () => {
      const linked = await createUser({ role: "STUDENT", telegramChatId: "555111" });
      const cookie = await sessionCookie(linked);
      await http().post("/api/v2/me/telegram/code").set("Cookie", cookie).set("Origin", TEST_APP_URL);

      const res = await http()
        .delete("/api/v2/me/telegram")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL);
      expect(res.status).toBe(200);

      const row = await testDb().user.findUnique({ where: { id: linked.id } });
      expect(row?.telegramChatId).toBeNull();
      expect(await testDb().telegramLinkRequest.count({ where: { userId: linked.id } })).toBe(0);
    });
  });

  describe("свой профиль и пароль", () => {
    it("профиль меняет только сам пользователь", async () => {
      const res = await send("patch", "/me/profile", "STUDENT", { firstName: "Новое", lastName: "Имя" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: ids.STUDENT, firstName: "Новое" });
    });

    it("неверный текущий пароль не принимается", async () => {
      const user = await createUser({ role: "STUDENT", password: "oldpassword" });
      const cookie = await sessionCookie(user);
      const wrong = await http()
        .post("/api/v2/me/password")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL)
        .send({ currentPassword: "nope-nope", newPassword: "newpassword" });
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toBe("currentPasswordIncorrect");

      const ok = await http()
        .post("/api/v2/me/password")
        .set("Cookie", cookie)
        .set("Origin", TEST_APP_URL)
        .send({ currentPassword: "oldpassword", newPassword: "newpassword" });
      expect(ok.status).toBe(201);
    });

    it("короткий новый пароль не проходит", async () => {
      const res = await send("post", "/me/password", "STUDENT", {
        currentPassword: "whatever",
        newPassword: "short",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("validationFailed");
    });
  });
});
