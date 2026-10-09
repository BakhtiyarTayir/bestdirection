import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TelegramNotifyService } from "../src/common/telegram/telegram-notify.service";
import {
  createBranch,
  createTestApp,
  createUser,
  sessionCookie,
  TEST_APP_URL,
  testDb,
  type TestApp,
} from "./helpers";

// Администратор видит и задаёт пароли учеников (PLAN-STUDENT-PASSWORDS-2026-10-09.md).

class TelegramNotifyStub {
  readonly sent: { chatId: string; text: string }[] = [];
  async send(chatId: string | null | undefined, text: string) {
    if (chatId) this.sent.push({ chatId, text });
  }
}

describe("пароли учеников", () => {
  let app: TestApp;
  const telegram = new TelegramNotifyStub();
  const cookies: Record<string, string> = {};
  let branchId: string;
  let adminId: string;
  const run = Date.now().toString(36);
  let counter = 0;
  const uniqueLogin = (base: string) => `${base}-${run}-${counter++}`;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ provide: TelegramNotifyService, useValue: telegram }] });
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"] as const) {
      const user = await createUser({ role });
      cookies[role] = await sessionCookie(user);
      if (role === "ADMIN") adminId = user.id;
    }
    branchId = (await createBranch("Пароли")).id;
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (method: "get" | "post", path: string, role: string, body?: object) => {
    const req = http()[method](`/api/v2${path}`).set("Cookie", cookies[role]);
    return method === "post" ? req.set("Origin", TEST_APP_URL).send(body) : req;
  };
  const login = (loginName: string, password: string) =>
    http().post("/api/v2/auth/login").set("Origin", TEST_APP_URL).send({ login: loginName, password });

  const createViaApi = (role: string, password: string) => {
    const loginName = uniqueLogin(role.toLowerCase());
    return as("post", "/users", "ADMIN", {
      login: loginName,
      password,
      firstName: "Тест",
      lastName: "Пароль",
      role,
      branchId,
    }).then((res) => ({ res, loginName }));
  };

  const newStudent = async (extra: { branch?: string } = {}) => {
    const user = await createUser({ role: "STUDENT", login: uniqueLogin("stu") });
    await testDb().user.update({ where: { id: user.id }, data: { branchId: extra.branch ?? branchId } });
    return user;
  };

  describe("права", () => {
    it("TEACHER, STUDENT, PARENT получают 403, ADMIN — 200", async () => {
      const student = await newStudent();
      const routes: Array<["get" | "post", string, object | undefined]> = [
        ["get", `/users/${student.id}/credentials`, undefined],
        ["post", `/users/${student.id}/password`, {}],
        ["get", `/users/students/never-logged-in?branchId=${branchId}`, undefined],
        ["post", "/users/students/issue-passwords", { studentIds: [student.id] }],
      ];
      for (const [method, path, body] of routes) {
        for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
          expect((await as(method, path, role, body)).status, `${role} ${method} ${path}`).toBe(403);
        }
      }
      // ADMIN: выдача идёт последней — она меняет пароль, но статус 200/201
      for (const [method, path, body] of routes) {
        const res = await as(method, path, "ADMIN", body);
        expect([200, 201], `ADMIN ${method} ${path}`).toContain(res.status);
      }
    });

    it("credentials не-ученика — 404", async () => {
      const teacher = await createUser({ role: "TEACHER" });
      expect((await as("get", `/users/${teacher.id}/credentials`, "ADMIN")).status).toBe(404);
      expect((await as("post", `/users/${teacher.id}/password`, "ADMIN", {})).status).toBe(404);
    });
  });

  describe("запоминание пароля", () => {
    it("ученик создан с паролем: credentials отдаёт тот же, вход работает", async () => {
      const { res, loginName } = await createViaApi("STUDENT", "parol-sozdaniya-1");
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordEnc|passwordHash/);

      const creds = await as("get", `/users/${res.body.id}/credentials`, "ADMIN");
      expect(creds.body).toEqual({ login: loginName, password: "parol-sozdaniya-1", state: "known" });
      expect((await login(loginName, "parol-sozdaniya-1")).status).toBe(201);
    });

    it("обычные ответы не содержат passwordEnc и passwordHash", async () => {
      const student = await newStudent();
      for (const path of [`/users/${student.id}`, "/users", "/auth/me"]) {
        const res = await as("get", path, "ADMIN");
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).not.toMatch(/passwordEnc|passwordHash/);
      }
    });

    it("ученик без сохранённого пароля: state unknown", async () => {
      const student = await createUser({ role: "STUDENT", password: "staryy-parol-1" });
      const creds = await as("get", `/users/${student.id}/credentials`, "ADMIN");
      expect(creds.status).toBe(200);
      expect(creds.body).toMatchObject({ password: null, state: "unknown" });
    });

    it("битое значение passwordEnc — unknown, а не 500", async () => {
      const student = await newStudent();
      await testDb().user.update({ where: { id: student.id }, data: { passwordEnc: "v1:xx:yy:zz" } });
      const creds = await as("get", `/users/${student.id}/credentials`, "ADMIN");
      expect(creds.body).toMatchObject({ password: null, state: "unknown" });
    });

    it("ученик сменил пароль в профиле: credentials отдаёт новый", async () => {
      const { res, loginName } = await createViaApi("STUDENT", "staryy-parol-2");
      const cookie = (await login(loginName, "staryy-parol-2")).headers["set-cookie"] as unknown as string[];
      const own = cookie.find((value) => value.startsWith("bd_session="))!.split(";")[0];
      const change = await http()
        .post("/api/v2/me/password")
        .set("Cookie", own)
        .set("Origin", TEST_APP_URL)
        .send({ currentPassword: "staryy-parol-2", newPassword: "novyy-parol-prof" });
      expect(change.status).toBe(201);

      const creds = await as("get", `/users/${res.body.id}/credentials`, "ADMIN");
      expect(creds.body.password).toBe("novyy-parol-prof");
    });

    it("ученик сбросил пароль через Telegram: credentials отдаёт новый", async () => {
      const student = await createUser({ role: "STUDENT", telegramChatId: `tg-pw-${run}` });
      const loginName = student.login;
      await as("post", `/users/${student.id}/password`, "ADMIN", { password: "ishodnyy-parol-1" });

      await http()
        .post("/api/v2/auth/password/telegram/request-code")
        .set("Origin", TEST_APP_URL)
        .send({ login: loginName });
      const code = telegram.sent.at(-1)!.text.match(/\d{6}/)![0];
      const reset = await http()
        .post("/api/v2/auth/password/telegram/reset")
        .set("Origin", TEST_APP_URL)
        .send({ login: loginName, code, newPassword: "tg-novyy-parol-1" });
      expect(reset.status).toBe(201);

      const creds = await as("get", `/users/${student.id}/credentials`, "ADMIN");
      expect(creds.body.password).toBe("tg-novyy-parol-1");
    });

    it("PATCH с password у ученика обновляет пароль; уход с роли STUDENT обнуляет", async () => {
      const { res } = await createViaApi("STUDENT", "parol-patch-001");
      const patch = await http()
        .patch(`/api/v2/users/${res.body.id}`)
        .set("Cookie", cookies.ADMIN)
        .set("Origin", TEST_APP_URL)
        .send({ password: "parol-patch-002" });
      expect(patch.status).toBe(200);
      expect((await as("get", `/users/${res.body.id}/credentials`, "ADMIN")).body.password).toBe("parol-patch-002");

      await http()
        .patch(`/api/v2/users/${res.body.id}`)
        .set("Cookie", cookies.ADMIN)
        .set("Origin", TEST_APP_URL)
        .send({ role: "TEACHER" });
      const row = await testDb().user.findUnique({ where: { id: res.body.id } });
      expect(row?.passwordEnc).toBeNull();
      expect(row?.passwordHash).not.toBeNull();
    });

    it("учитель и родитель: passwordEnc остаётся null (создание, PATCH, смена в профиле)", async () => {
      const { res: teacher, loginName } = await createViaApi("TEACHER", "parol-uchitelya-1");
      const { res: parent } = await createViaApi("PARENT", "parol-roditelya-1");
      await http()
        .patch(`/api/v2/users/${teacher.body.id}`)
        .set("Cookie", cookies.ADMIN)
        .set("Origin", TEST_APP_URL)
        .send({ password: "parol-uchitelya-2" });
      const own = (await login(loginName, "parol-uchitelya-2")).headers["set-cookie"] as unknown as string[];
      await http()
        .post("/api/v2/me/password")
        .set("Cookie", own.find((value) => value.startsWith("bd_session="))!.split(";")[0])
        .set("Origin", TEST_APP_URL)
        .send({ currentPassword: "parol-uchitelya-2", newPassword: "parol-uchitelya-3" });

      for (const id of [teacher.body.id, parent.body.id]) {
        expect((await testDb().user.findUnique({ where: { id } }))?.passwordEnc).toBeNull();
      }
    });

    it("родитель, заведённый из карточки ученика, — passwordEnc null", async () => {
      const student = await newStudent();
      const res = await as("post", "/parents", "ADMIN", {
        studentId: student.id,
        firstName: "Родитель",
        lastName: "Тестовый",
        phone: "+998901112233",
      });
      expect(res.status).toBe(201);
      const parentId = res.body.id ?? res.body.parent?.id;
      expect(parentId).toBeTruthy();
      expect((await testDb().user.findUnique({ where: { id: parentId } }))?.passwordEnc).toBeNull();
    });

    it("POST /users/:id/password: свой пароль и сгенерированный, сессии не рвутся", async () => {
      const student = await newStudent();
      const studentCookie = await sessionCookie(student);

      const own = await as("post", `/users/${student.id}/password`, "ADMIN", { password: "zadan-adminom-1" });
      expect(own.body).toEqual({ login: student.login, password: "zadan-adminom-1" });
      expect((await login(student.login, "zadan-adminom-1")).status).toBe(201);

      const generated = await as("post", `/users/${student.id}/password`, "ADMIN", {});
      expect(generated.body.password).toMatch(/^[a-zA-Z2-9]{8}$/);
      expect((await login(student.login, generated.body.password)).status).toBe(201);
      expect((await as("get", `/users/${student.id}/credentials`, "ADMIN")).body.password).toBe(generated.body.password);

      const short = await as("post", `/users/${student.id}/password`, "ADMIN", { password: "abc" });
      expect(short.status).toBe(400);

      // Существующая сессия ученика жива
      expect((await http().get("/api/v2/auth/me").set("Cookie", studentCookie)).status).toBe(200);
    });
  });

  describe("последний вход", () => {
    it("вход по паролю ставит lastLoginAt", async () => {
      const student = await newStudent();
      await as("post", `/users/${student.id}/password`, "ADMIN", { password: "vhod-parol-001" });
      expect((await testDb().user.findUnique({ where: { id: student.id } }))?.lastLoginAt).toBeNull();
      await login(student.login, "vhod-parol-001");
      expect((await testDb().user.findUnique({ where: { id: student.id } }))?.lastLoginAt).not.toBeNull();
    });

    it("вход по коду Telegram ставит lastLoginAt", async () => {
      const chat = `tg-login-${run}`;
      const student = await createUser({ role: "STUDENT", telegramChatId: chat });
      const code = randomBytes(16).toString("hex");
      await testDb().telegramAuthRequest.create({
        data: { code, status: "CONFIRMED", telegramChatId: chat, expiresAt: new Date(Date.now() + 60_000) },
      });
      const res = await http().post("/api/v2/auth/telegram/code").set("Origin", TEST_APP_URL).send({ code });
      expect(res.status).toBe(201);
      expect((await testDb().user.findUnique({ where: { id: student.id } }))?.lastLoginAt).not.toBeNull();
    });
  });

  describe("массовая выдача", () => {
    it("предпросмотр: без вошедших, по филиалу", async () => {
      const otherBranch = await createBranch("Другой");
      const fresh = await newStudent();
      const withSession = await newStudent();
      await sessionCookie(withSession);
      const withLogin = await newStudent();
      await testDb().user.update({ where: { id: withLogin.id }, data: { lastLoginAt: new Date() } });
      const elsewhere = await newStudent({ branch: otherBranch.id });

      const res = await as("get", `/users/students/never-logged-in?branchId=${branchId}`, "ADMIN");
      const ids = res.body.students.map((s: { id: string }) => s.id);
      expect(ids).toContain(fresh.id);
      expect(ids).not.toContain(withSession.id);
      expect(ids).not.toContain(withLogin.id);
      expect(ids).not.toContain(elsewhere.id);
      expect(res.body.count).toBe(ids.length);
      expect(res.body.students[0]).toHaveProperty("branch");
    });

    it("вошедшие пропускаются даже при присланном id; у каждого свой пароль; вход работает", async () => {
      const a = await newStudent();
      const b = await newStudent();
      const withSession = await newStudent();
      await sessionCookie(withSession);
      const withLogin = await newStudent();
      await testDb().user.update({ where: { id: withLogin.id }, data: { lastLoginAt: new Date() } });
      const teacher = await createUser({ role: "TEACHER" });
      const keep = await testDb().user.findUnique({ where: { id: withSession.id } });

      const res = await as("post", "/users/students/issue-passwords", "ADMIN", {
        studentIds: [a.id, b.id, withSession.id, withLogin.id, teacher.id, "net-takogo"],
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(2);
      const byLogin = Object.fromEntries(res.body.map((r: { login: string; password: string }) => [r.login, r.password]));
      expect(Object.keys(byLogin).sort()).toEqual([a.login, b.login].sort());
      expect(byLogin[a.login]).not.toBe(byLogin[b.login]);
      expect(res.body[0]).toHaveProperty("fullName");
      expect(res.body[0]).toHaveProperty("branch");

      for (const student of [a, b]) {
        expect((await login(student.login, byLogin[student.login])).status).toBe(201);
        expect((await as("get", `/users/${student.id}/credentials`, "ADMIN")).body.password).toBe(
          byLogin[student.login]
        );
      }
      // Пропущенные не тронуты
      const after = await testDb().user.findUnique({ where: { id: withSession.id } });
      expect(after?.passwordHash).toBe(keep?.passwordHash);
      expect(after?.passwordEnc).toBeNull();
      expect((await testDb().user.findUnique({ where: { id: teacher.id } }))?.passwordEnc).toBeNull();
    });
  });

  describe("известный пароль", () => {
    it("не входивший ученик с известным паролем не попадает в предпросмотр и не перевыдаётся", async () => {
      const { res, loginName } = await createViaApi("STUDENT", "izvestnyy-parol-1");
      const preview = await as("get", `/users/students/never-logged-in?branchId=${branchId}`, "ADMIN");
      expect(preview.body.students.map((s: { id: string }) => s.id)).not.toContain(res.body.id);

      const issued = await as("post", "/users/students/issue-passwords", "ADMIN", { studentIds: [res.body.id] });
      expect(issued.status).toBe(201);
      expect(issued.body).toEqual([]);
      expect((await as("get", `/users/${res.body.id}/credentials`, "ADMIN")).body.password).toBe("izvestnyy-parol-1");
      expect((await login(loginName, "izvestnyy-parol-1")).status).toBe(201);
    });
  });

  describe("аудит", () => {
    it("пароли не попадают в AuditLog ни в каком виде", async () => {
      const { res } = await createViaApi("STUDENT", "sekretnyy-parol-A1");
      await as("get", `/users/${res.body.id}/credentials`, "ADMIN");
      await as("post", `/users/${res.body.id}/password`, "ADMIN", { password: "sekretnyy-parol-B2" });
      const fresh = await newStudent();
      const bulk = await as("post", "/users/students/issue-passwords", "ADMIN", { studentIds: [fresh.id] });
      await http()
        .patch(`/api/v2/users/${res.body.id}`)
        .set("Cookie", cookies.ADMIN)
        .set("Origin", TEST_APP_URL)
        .send({ password: "sekretnyy-parol-C3" });

      const logs = await testDb().auditLog.findMany({ where: { userId: adminId } });
      const dump = JSON.stringify(logs);
      for (const secret of ["sekretnyy-parol-A1", "sekretnyy-parol-B2", "sekretnyy-parol-C3", bulk.body[0].password]) {
        expect(dump).not.toContain(secret);
      }
      expect(dump).not.toMatch(/v1:|passwordEnc|passwordHash/);
      // Факт просмотра записан
      expect(
        logs.some(
          (log) =>
            log.entityId === res.body.id && (log.metadata as { viewedPassword?: boolean } | null)?.viewedPassword === true
        )
      ).toBe(true);
    });
  });

  describe("выгрузка логинов и фильтры списка", () => {
    const own: {
      courseA?: string;
      courseB?: string;
      groupA?: string;
      groupB?: string;
      other?: string;
      stuA?: { id: string; login: string; lastName: string };
      stuB?: { id: string; login: string; lastName: string };
      stuLeft?: { id: string; login: string; lastName: string };
    } = {};

    beforeAll(async () => {
      const teacher = await createUser({ role: "TEACHER" });
      const exportBranch = await createBranch("Выгрузка");
      const otherBranch = await createBranch("Выгрузка-2");
      own.other = otherBranch.id;
      const mkCourse = (key: string) =>
        testDb().course.create({
          data: { slug: `exp-${key}-${run}`, title: `Курс ${key}`, teacherId: teacher.id, price: 100000 },
        });
      const courseA = await mkCourse("A");
      const courseB = await mkCourse("B");
      const mkGroup = (key: string, courseId: string, branch: string) =>
        testDb().group.create({
          data: { name: `Гр-${key}-${run}`, courseId, scheduleDays: [1], branchId: branch, price: 100000 },
        });
      const groupA = await mkGroup("A", courseA.id, exportBranch.id);
      const groupB = await mkGroup("B", courseB.id, otherBranch.id);
      own.courseA = courseA.id;
      own.courseB = courseB.id;
      own.groupA = groupA.id;
      own.groupB = groupB.id;

      const startsAt = new Date("2026-01-01T12:00:00.000Z");
      const enroll = (studentId: string, courseId: string, groupId: string, unenrolledAt: Date | null = null) =>
        testDb().enrollment.create({ data: { studentId, courseId, groupId, startsAt, unenrolledAt } });

      own.stuA = await newStudent();
      own.stuB = await newStudent();
      own.stuLeft = await newStudent();
      await enroll(own.stuA.id, courseA.id, groupA.id);
      await enroll(own.stuB.id, courseB.id, groupB.id);
      await enroll(own.stuLeft.id, courseA.id, groupA.id, new Date("2026-02-01T12:00:00.000Z"));
      // stuA знает пароль, stuB нет
      await as("post", `/users/${own.stuA.id}/password`, "ADMIN", { password: "parol-vygruzki-1" });
    });

    const exportRows = async (query: string) => {
      const res = await as("get", `/users/students/credentials-export?${query}`, "ADMIN");
      expect(res.status).toBe(200);
      return res.body as { fullName: string; login: string; password: string | null; branch: string | null; groups: string }[];
    };

    it("права: только ADMIN", async () => {
      expect((await as("get", "/users/students/credentials-export", "ADMIN")).status).toBe(200);
      for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
        expect((await as("get", "/users/students/credentials-export", role)).status, role).toBe(403);
      }
    });

    it("фильтр по курсу и по группе; отчисленный не попадает", async () => {
      const byCourse = (await exportRows(`courseId=${own.courseA}`)).map((r) => r.login);
      expect(byCourse).toEqual([own.stuA!.login]);

      const byGroup = (await exportRows(`groupId=${own.groupB}`)).map((r) => r.login);
      expect(byGroup).toEqual([own.stuB!.login]);

      // Курс и группа — к одной записи: группа B не принадлежит курсу A
      expect(await exportRows(`courseId=${own.courseA}&groupId=${own.groupB}`)).toEqual([]);
      // Филиал считается по группе записи
      const byBranch = (await exportRows(`courseId=${own.courseB}&branchId=${own.other}`)).map((r) => r.login);
      expect(byBranch).toEqual([own.stuB!.login]);
    });

    it("известный пароль возвращается, неизвестный — null; группы собраны строкой", async () => {
      const a = (await exportRows(`groupId=${own.groupA}`))[0];
      expect(a).toMatchObject({ login: own.stuA!.login, password: "parol-vygruzki-1" });
      expect(a.groups).toBe(`Курс A — Гр-A-${run}`);
      const b = (await exportRows(`groupId=${own.groupB}`))[0];
      expect(b.password).toBeNull();
    });

    it("в аудите одна запись экспорта, без паролей", async () => {
      const before = await testDb().auditLog.count({ where: { userId: adminId, entityType: "StudentCredentials" } });
      await exportRows(`courseId=${own.courseA}`);
      const logs = await testDb().auditLog.findMany({
        where: { userId: adminId, entityType: "StudentCredentials" },
        orderBy: { createdAt: "desc" },
      });
      expect(logs.length).toBe(before + 1);
      expect(logs[0].metadata).toMatchObject({ exportedPasswords: true, count: 1, filters: { courseId: own.courseA } });
      expect(JSON.stringify(logs)).not.toContain("parol-vygruzki-1");
    });

    it("список учеников: courseId и groupId", async () => {
      const ids = async (query: string) => {
        const res = await as("get", `/billing/students?${query}`, "ADMIN");
        expect(res.status).toBe(200);
        return res.body.map((s: { id: string }) => s.id) as string[];
      };
      const byCourse = await ids(`courseId=${own.courseA}`);
      expect(byCourse).toContain(own.stuA!.id);
      expect(byCourse).not.toContain(own.stuB!.id);
      expect(byCourse).not.toContain(own.stuLeft!.id);

      const byGroup = await ids(`groupId=${own.groupB}`);
      expect(byGroup).toEqual([own.stuB!.id]);
    });
  });
});
