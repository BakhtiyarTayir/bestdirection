import { Controller, Get } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { afterAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers";
import { findUnprotectedRoutes } from "./find-unprotected-routes";

// Аналог «сделать roles обязательным» из аудита: маршрут без явного правила
// доступа не проходит этот тест, а значит и CI.
describe("правило доступа у каждого маршрута", () => {
  const apps: TestApp[] = [];
  afterAll(async () => {
    for (const app of apps) await app.close();
  });

  it("у всех маршрутов api есть @Public, @Authenticated или @CheckPolicies", async () => {
    const app = await createTestApp({ imports: [DiscoveryModule] });
    apps.push(app);
    expect(findUnprotectedRoutes(app)).toEqual([]);
  });

  it("проверка действительно ловит маршрут без правила", async () => {
    @Controller("forgotten")
    class ForgottenController {
      @Get()
      list() {
        return [];
      }
    }
    const app = await createTestApp({ imports: [DiscoveryModule], controllers: [ForgottenController] });
    apps.push(app);
    expect(findUnprotectedRoutes(app)).toEqual(["ForgottenController.list"]);
  });
});
