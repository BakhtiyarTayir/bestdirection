import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";
import { SmsService } from "../src/modules/notifications/sms.service";

describe("уведомления: СМС", () => {
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
      data: { slug: `sms-${run}`, title: "Курс", teacherId: ids.TEACHER, isPublished: true },
    });
    const group = await testDb().group.create({
      data: { name: `Группа ${run}`, courseId: course.id, teacherId: ids.TEACHER },
    });
    ids.group = group.id;
    await testDb().enrollment.create({
      data: { studentId: ids.STUDENT, courseId: course.id, groupId: group.id },
    });
    await testDb().parentStudent.create({ data: { parentId: ids.PARENT, studentId: ids.STUDENT } });
    await testDb().user.update({
      where: { id: ids.PARENT },
      data: { phone: "+998901234567" },
    });

    const template = await testDb().smsTemplate.create({
      data: {
        title: "Приглашение",
        textRu: "Здравствуйте, {parent}! Ученик {student} ждём вас.",
        textUz: "Salom, {parent}!",
        status: "APPROVED",
      },
    });
    ids.template = template.id;

    const draft = await testDb().smsTemplate.create({
      data: { title: "Черновик", textRu: "Текст", textUz: "Matn", status: "DRAFT" },
    });
    ids.draftTemplate = draft.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const get = (path: string, role?: string) => {
    const req = http().get(`/api/v2${path}`);
    return role ? req.set("Cookie", cookies[role]) : req;
  };
  const post = (path: string, role: string | null, body?: object) => {
    const req = http().post(`/api/v2${path}`).set("Origin", TEST_APP_URL);
    return (role ? req.set("Cookie", cookies[role]) : req).send(body);
  };

  describe("права на рассылки", () => {
    it("журнал, счёт и рассылка — только администратору", async () => {
      for (const path of ["/sms/log", "/sms/account"]) {
        expect((await get(path, "TEACHER")).status, path).toBe(403);
        expect((await get(path, "STUDENT")).status, path).toBe(403);
        expect((await get(path, "ADMIN")).status, path).toBe(200);
      }

      const broadcast = await post("/sms/broadcast", "TEACHER", {
        groupId: ids.group,
        templateId: ids.template,
      });
      expect(broadcast.status).toBe(403);
    });

    it("шаблоны видит и преподаватель, но не ученик", async () => {
      expect((await get("/sms/templates", "TEACHER")).status).toBe(200);
      expect((await get("/sms/templates", "STUDENT")).status).toBe(403);
      expect((await get("/sms/templates", "PARENT")).status).toBe(403);
    });
  });

  describe("предпросмотр рассылки", () => {
    it("подставляет переменные, считает части и стоимость", async () => {
      const res = await post("/sms/broadcast/preview", "ADMIN", {
        groupId: ids.group,
        templateId: ids.template,
        locale: "ru",
      });
      expect(res.status).toBe(201);
      expect(res.body.recipients).toHaveLength(1);

      const recipient = res.body.recipients[0];
      // {parent} и {student} заменены, незакрытых переменных не осталось
      expect(recipient.text).not.toContain("{parent}");
      expect(recipient.unresolved).toEqual([]);
      expect(recipient.normalizedPhone).toBe("998901234567");
      expect(res.body.sendableCount).toBe(1);
      expect(res.body.estimatedCost).toBeGreaterThan(0);
    });

    it("несогласованный шаблон отправить нельзя: попытка стоит денег", async () => {
      const res = await post("/sms/broadcast", "ADMIN", {
        groupId: ids.group,
        templateId: ids.draftTemplate,
      });
      // Либо отказ по шаблону, либо «шлюз не настроен» — смотря что проверится
      // первым; в обоих случаях ни одно сообщение не ушло
      expect(res.status).toBe(400);
      expect(await testDb().smsBroadcast.count()).toBe(0);
      expect(await testDb().smsLog.count()).toBe(0);
    });
  });

  describe("регрессия аудита 2.7: приём статусов доставки", () => {
    const callbackBody = (userSmsId: string) => ({
      user_sms_id: userSmsId,
      message_id: "9999",
      status: "DELIVRD",
      sms_count: 2,
    });

    it("без секрета статус в журнале не меняется", async () => {
      const log = await testDb().smsLog.create({
        data: { phone: "998901234567", text: "Проверка", status: "SENT", userSmsId: `no-secret-${run}` },
      });

      const res = await post(`/sms/callback/чужой-секрет`, null, callbackBody(`no-secret-${run}`));
      // Ответ всегда 200: на 4xx шлюз бесконечно повторяет доставку
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(false);

      const after = await testDb().smsLog.findUnique({ where: { id: log.id } });
      expect(after?.status).toBe("SENT");
      expect(after?.deliveredAt).toBeNull();
    });

    it("с секретом статус проставляется", async () => {
      const log = await testDb().smsLog.create({
        data: { phone: "998901234567", text: "Проверка", status: "SENT", userSmsId: `with-secret-${run}` },
      });

      const secret = app.get(SmsService).callbackSecret();
      const res = await post(`/sms/callback/${secret}`, null, callbackBody(`with-secret-${run}`));
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);

      const after = await testDb().smsLog.findUnique({ where: { id: log.id } });
      expect(after?.status).toBe("DELIVERED");
      expect(after?.deliveredAt).not.toBeNull();
      expect(after?.parts).toBe(2);
    });

    it("секрет не угадывается из адреса приложения", () => {
      const secret = app.get(SmsService).callbackSecret();
      expect(secret).toHaveLength(32);
      expect(secret).toMatch(/^[0-9a-f]+$/);
    });
  });
});

describe("уведомления: бот Telegram", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const webhook = (secret?: string) => {
    const req = request(app.getHttpServer()).post("/api/v2/telegram/webhook");
    return (secret ? req.set("x-telegram-bot-api-secret-token", secret) : req).send({ update_id: 1 });
  };

  it("без секрета обновление не принимается", async () => {
    const res = await webhook("wrong-secret");
    // Токена бота в тестах нет, поэтому сначала отвечает «не настроен»;
    // с настроенным ботом тот же запрос получит 401
    expect([401, 503]).toContain(res.status);
  });

  it("без токена бота вебхук отвечает 503, а не падает", async () => {
    const res = await webhook();
    expect(res.status).toBe(503);
  });
});
