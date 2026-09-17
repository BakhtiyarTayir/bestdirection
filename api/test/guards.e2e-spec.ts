import { Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { Authenticated, CurrentUser } from "../src/common/auth/decorators";
import type { SessionUser } from "../src/common/auth/session-user";
import { CheckPolicies } from "../src/common/policies/check-policies.decorator";
import {
  createTestApp,
  createUser,
  sessionCookie,
  TEST_APP_URL,
  TEST_INTERNAL_TOKEN,
  type TestApp,
} from "./helpers";

class RenameDto extends createZodDto(z.object({ name: z.string().min(1).max(50) })) {}

// Тестовые маршруты: в AppModule их нет, поэтому тест метаданных они не трогают
@Controller("test-guards")
class GuardsTestController {
  @Get("forgotten")
  forgotten() {
    return "не должно выполниться";
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get("admin-only")
  adminOnly() {
    return { ok: true };
  }

  @Authenticated()
  @Post("rename")
  rename(@Body() body: RenameDto, @CurrentUser() user: SessionUser) {
    return { body, userId: user.id };
  }

  @Authenticated()
  @Get("missing")
  missing() {
    throw new NotFoundException("courseNotFound");
  }

  @Authenticated()
  @Get("crash")
  crash() {
    throw new Error("secret internal detail");
  }
}

describe("guards, валидация и формат ошибок", () => {
  let app: TestApp;
  let adminCookie: string;
  let studentCookie: string;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [GuardsTestController] });
    adminCookie = await sessionCookie(await createUser({ role: "ADMIN" }), { roleInToken: "ADMIN" });
    studentCookie = await sessionCookie(await createUser({ role: "STUDENT" }));
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe("запрет по умолчанию", () => {
    it("маршрут без правила доступа — 403 даже администратору", async () => {
      const res = await http().get("/api/v2/test-guards/forgotten").set("Cookie", adminCookie);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("forbidden");
    });

    it("без входа — 401 раньше, чем 403", async () => {
      expect((await http().get("/api/v2/test-guards/forgotten")).status).toBe(401);
    });

    it("@CheckPolicies: администратору можно, ученику — 403", async () => {
      expect((await http().get("/api/v2/test-guards/admin-only").set("Cookie", adminCookie)).status).toBe(200);
      expect((await http().get("/api/v2/test-guards/admin-only").set("Cookie", studentCookie)).status).toBe(403);
    });
  });

  describe("CSRF: проверка Origin (аудит, раздел 4.4 плана)", () => {
    const rename = () => http().post("/api/v2/test-guards/rename").set("Cookie", studentCookie).send({ name: "x" });

    it("свой Origin — пропускает", async () => {
      expect((await rename().set("Origin", TEST_APP_URL)).status).toBe(201);
    });

    it("чужой Origin — 403", async () => {
      const res = await rename().set("Origin", "https://evil.example");
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("forbiddenOrigin");
    });

    it("Origin: null — 403", async () => {
      expect((await rename().set("Origin", "null")).status).toBe(403);
    });

    it("без Origin и без внутреннего токена — 403", async () => {
      expect((await rename()).status).toBe(403);
    });

    it("без Origin, но с внутренним токеном web — пропускает", async () => {
      expect((await rename().set("X-Internal-Token", TEST_INTERNAL_TOKEN)).status).toBe(201);
    });

    it("неверный внутренний токен — 403", async () => {
      expect((await rename().set("X-Internal-Token", "wrong")).status).toBe(403);
    });

    it("чужой Origin отсекается до проверки сессии", async () => {
      const res = await http().post("/api/v2/test-guards/rename").set("Origin", "https://evil.example").send({});
      expect(res.status).toBe(403);
    });
  });

  describe("валидация zod", () => {
    const post = (body: unknown) =>
      http().post("/api/v2/test-guards/rename").set("Cookie", studentCookie).set("Origin", TEST_APP_URL).send(body as object);

    it("неверное тело — 400 с деталями", async () => {
      const res = await post({ name: "" });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: "Bad Request", message: "validationFailed" });
      expect(res.body.details[0].path).toEqual(["name"]);
    });

    it("слишком длинная строка — 400", async () => {
      expect((await post({ name: "x".repeat(51) })).status).toBe(400);
    });

    it("лишние поля отбрасываются", async () => {
      const res = await post({ name: "ok", role: "ADMIN" });
      expect(res.status).toBe(201);
      expect(res.body.body).toEqual({ name: "ok" });
    });
  });

  describe("формат ошибок", () => {
    it("ключ перевода из исключения сохраняется", async () => {
      const res = await http().get("/api/v2/test-guards/missing").set("Cookie", studentCookie);
      expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: "courseNotFound" });
    });

    it("внутренняя ошибка не раскрывает подробности", async () => {
      const res = await http().get("/api/v2/test-guards/crash").set("Cookie", studentCookie);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ statusCode: 500, error: "Internal Server Error", message: "somethingWentWrong" });
    });

    it("несуществующий маршрут — 404 с ключом notFound", async () => {
      const res = await http().get("/api/v2/no-such-route").set("Cookie", studentCookie);
      expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: "notFound" });
    });
  });
});
