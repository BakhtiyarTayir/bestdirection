import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, testDb, type TestApp } from "./helpers";

describe("лендинг и заявки", () => {
  let app: TestApp;
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const run = Date.now().toString(36);

  beforeAll(async () => {
    app = await createTestApp();
    for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const) {
      const user = await createUser({ role });
      cookies[role] = await sessionCookie(user, { roleInToken: role });
    }

    const course = await testDb().marketingCourse.create({
      data: { slug: `kurs-${run}`, title: "Английский с нуля", published: true, sortOrder: 0 },
    });
    ids.course = course.id;

    await testDb().marketingCourse.create({
      data: { slug: `skrytyy-${run}`, title: "Скрытый курс", published: false, sortOrder: 1 },
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
  const send = (
    method: "post" | "patch" | "put" | "delete",
    path: string,
    role: string | null,
    body?: object
  ) => {
    const req = http()[method](`/api/v2${path}`).set("Origin", TEST_APP_URL);
    return (role ? req.set("Cookie", cookies[role]) : req).send(body);
  };

  describe("публичное чтение", () => {
    it("лендинг отдаётся без входа и скрытого не показывает", async () => {
      const res = await get("/marketing/landing");
      expect(res.status).toBe(200);

      const slugs = res.body.courses.map((course: { slug: string }) => course.slug);
      expect(slugs).toContain(`kurs-${run}`);
      expect(slugs).not.toContain(`skrytyy-${run}`);
    });

    it("страница лендинга: опубликованная открыта, черновик — 404", async () => {
      await testDb().marketingPage.create({
        data: {
          slug: `o-nas-${run}`,
          titleRu: "О нас",
          titleUz: "Biz haqimizda",
          published: true,
          contentRu: { blocks: [{ type: "paragraph", data: { text: "Просто текст" } }] },
        },
      });
      await testDb().marketingPage.create({
        data: { slug: `chernovik-${run}`, titleRu: "Черновик", titleUz: "Qoralama", published: false },
      });

      expect((await get(`/marketing/pages/o-nas-${run}`)).status).toBe(200);
      expect((await get(`/marketing/pages/chernovik-${run}`)).status).toBe(404);
    });
  });

  describe("регрессия аудита 2.11: разметка лендинга", () => {
    it("скрипт и опасная ссылка не сохраняются", async () => {
      const res = await send("post", "/marketing/pages", "ADMIN", {
        slug: `xss-${run}`,
        titleRu: "Проверка",
        titleUz: "Tekshiruv",
        published: true,
        contentRu: {
          blocks: [
            {
              type: "paragraph",
              data: { text: 'Текст <script>alert(1)</script><b>жирный</b> <a href="javascript:alert(2)">ссылка</a>' },
            },
            { type: "header", data: { level: 2, text: '<img src=x onerror=alert(3)>Заголовок' } },
            { type: "list", data: { style: "unordered", items: ["<i>пункт</i><script>alert(4)</script>"] } },
          ],
        },
      });
      expect(res.status).toBe(201);

      const saved = await testDb().marketingPage.findUnique({ where: { slug: `xss-${run}` } });
      const json = JSON.stringify(saved?.contentRu);
      expect(json).not.toContain("script");
      expect(json).not.toContain("javascript:");
      expect(json).not.toContain("onerror");
      // Разрешённая разметка остаётся: редактор ей пользуется
      expect(json).toContain("<b>жирный</b>");
      expect(json).toContain("<i>пункт</i>");
    });

    it("разметка, записанная до очистки, не доезжает до сайта", async () => {
      await testDb().marketingPage.create({
        data: {
          slug: `staryy-${run}`,
          titleRu: "Старая страница",
          titleUz: "Eski sahifa",
          published: true,
          // Такую строку мог записать прежний код — он ничего не чистил
          contentRu: {
            blocks: [{ type: "paragraph", data: { text: '<script>alert("старый")</script>Текст' } }],
          },
        },
      });

      const res = await get(`/marketing/pages/staryy-${run}`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body.contentRu)).not.toContain("script");
      expect(JSON.stringify(res.body.contentRu)).toContain("Текст");
    });

    it("блок неизвестного типа отбрасывается", async () => {
      const res = await send("post", "/marketing/pages", "ADMIN", {
        slug: `neznakomyy-${run}`,
        titleRu: "Блоки",
        titleUz: "Bloklar",
        published: true,
        contentRu: {
          blocks: [
            { type: "raw", data: { html: "<script>alert(5)</script>" } },
            { type: "paragraph", data: { text: "Остаётся" } },
          ],
        },
      });
      expect(res.status).toBe(201);

      const saved = await testDb().marketingPage.findUnique({ where: { slug: `neznakomyy-${run}` } });
      const blocks = (saved?.contentRu as { blocks: { type: string }[] }).blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("paragraph");
    });
  });

  describe("права на правку лендинга", () => {
    it("менять контент может только администратор", async () => {
      for (const role of ["TEACHER", "STUDENT"]) {
        const res = await send("post", "/marketing/courses", role, {
          slug: `chuzhoy-${run}`,
          title: "Чужой",
        });
        expect(res.status, role).toBe(403);
      }
      expect((await get("/marketing/admin", "TEACHER")).status).toBe(403);
      expect((await get("/marketing/admin", "ADMIN")).status).toBe(200);
    });

    it("занятый адрес курса не перезаписывается", async () => {
      const res = await send("post", "/marketing/courses", "ADMIN", {
        slug: `kurs-${run}`,
        title: "Дубль",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("slugTaken");
    });

    it("служебный адрес страницей занять нельзя", async () => {
      const res = await send("post", "/marketing/pages", "ADMIN", {
        slug: "login",
        titleRu: "Подмена",
        titleUz: "Almashtirish",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("slugTaken");
    });
  });

  describe("заявки с сайта", () => {
    it("заявка с формы сохраняется, название курса берётся из лендинга", async () => {
      const res = await send("post", "/leads", null, {
        courseSlug: `kurs-${run}`,
        fullName: "Иван Петров",
        phone: "+998901112233",
        message: "Хочу учиться",
      });
      expect(res.status).toBe(201);

      const lead = await testDb().courseLead.findFirst({
        where: { phone: "+998901112233" },
        select: { courseName: true, contacted: true },
      });
      expect(lead?.courseName).toBe("Английский с нуля");
      expect(lead?.contacted).toBe(false);
    });

    it("ловушка для ботов молчит: ответ успешный, заявки нет", async () => {
      const before = await testDb().courseLead.count();
      const res = await send("post", "/leads", null, {
        courseSlug: `kurs-${run}`,
        fullName: "Бот Ботов",
        phone: "+998900000000",
        website: "https://spam.example",
      });
      expect(res.status).toBe(201);
      expect(await testDb().courseLead.count()).toBe(before);
    });

    it("несуществующий курс заявку не принимает", async () => {
      const res = await send("post", "/leads", null, {
        courseSlug: "takogo-net",
        fullName: "Иван Петров",
        phone: "+998901112233",
      });
      expect(res.status).toBe(404);
    });

    it("список заявок и отметка о звонке — только администратору", async () => {
      expect((await get("/leads", "TEACHER")).status).toBe(403);

      const list = await get("/leads", "ADMIN");
      expect(list.status).toBe(200);
      expect(list.body.length).toBeGreaterThan(0);

      const marked = await send("patch", `/leads/${list.body[0].id}`, "ADMIN", { contacted: true });
      expect(marked.status).toBe(200);
      expect(marked.body.contacted).toBe(true);
    });

    it("регрессия аудита 7.1: поток заявок ограничен", async () => {
      const attempts = [];
      for (let i = 0; i < 8; i++) {
        attempts.push(
          await send("post", "/leads", null, {
            courseSlug: `kurs-${run}`,
            fullName: `Поток ${i}`,
            phone: `+99890111${String(i).padStart(4, "0")}`,
          })
        );
      }

      const tooMany = attempts.filter((res) => res.status === 429);
      expect(tooMany.length).toBeGreaterThan(0);
    });
  });

  describe("логотип школы", () => {
    it("читается без входа, меняется администратором", async () => {
      const saved = await send("put", "/marketing/logo", "ADMIN", {
        url: "/uploads/images/logo.png",
      });
      expect([200, 201]).toContain(saved.status);

      const res = await get("/marketing/logo");
      expect(res.status).toBe(200);
      expect(res.body.url).toBe("/uploads/images/logo.png");
    });

    it("чужой адрес логотипом не становится", async () => {
      const res = await send("put", "/marketing/logo", "ADMIN", {
        url: "https://example.com/logo.png",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("invalidLogoPath");

      // Прежнее значение на месте
      const current = await get("/marketing/logo");
      expect(current.body.url).toBe("/uploads/images/logo.png");
    });

    it("логотип лежит под тем же ключом, что и раньше", async () => {
      const row = await testDb().siteSetting.findUnique({ where: { key: "siteLogoUrl" } });
      expect(row?.value).toBe("/uploads/images/logo.png");
    });
  });
});
