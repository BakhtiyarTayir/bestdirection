import { readFileSync } from "node:fs";
import { join } from "node:path";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { RequestMethod } from "@nestjs/common";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { readAccessRule } from "../src/common/policies/access-metadata";
import { defineAbilityFor } from "../src/common/policies/abilities";
import { createTestApp, createUser, sessionCookie, TEST_APP_URL, type TestApp } from "./helpers";

// Полный снимок маршрутов: добавление любого маршрута требует явного решения о менеджере.
const manifest = JSON.parse(
  readFileSync(join(__dirname, "manager-route-manifest.json"), "utf8")
) as string[];

const closed = new Set([
  "AdminDashboardController.setHosting",
  "AuditLogController.list",
  "BranchesController.create",
  "BranchesController.update",
  "BranchesController.remove",
  "BillingController.deletePayment",
  "BillingController.listRefunds",
  "BillingController.createRefund",
  "BillingController.deleteRefund",
  "FinanceController.overview",
  "FinanceController.handoversList",
  "FinanceController.createHandover",
  "FinanceController.deleteHandover",
  "SalaryController.overview",
  "SalaryController.me",
  "SalaryController.groupStudents",
  "SalaryController.payoutsList",
  "SalaryController.payoutTeacherOptions",
  "SalaryController.createPayout",
  "SalaryController.deletePayout",
  "SalaryController.createAdjustment",
  "SalaryController.deleteAdjustment",
  "SalaryController.setManualAmount",
  "SalaryController.teacherDetail",
  "SalaryController.recalculate",
]);

describe("MANAGER: все маршруты приложения", () => {
  let app: TestApp;
  afterAll(async () => { if (app) await app.close(); });

  it("сверяет полный список маршрутов и получает 403 на закрытых", async () => {
    app = await createTestApp({ imports: [DiscoveryModule] });
    const cookie = await sessionCookie(await createUser({ role: "MANAGER" }));
    const ability = defineAbilityFor({ id: "manager", role: "MANAGER" });
    const discovery = app.get(DiscoveryService);
    const reflector = app.get(Reflector);
    const scanner = new MetadataScanner();
    const seen: string[] = [];
    const denied: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype as (new (...args: unknown[]) => unknown) | null;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[methodName] as (...args: unknown[]) => unknown;
        const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (methodPath === undefined) continue;
        const key = `${controller.name}.${methodName}`;
        seen.push(key);
        const rule = readAccessRule(reflector, handler, controller);
        const permitted = rule.kind === "public" || rule.kind === "authenticated" ||
          (rule.kind === "policies" && rule.handlers.every((check) => check(ability)));
        if (permitted) continue;
        denied.push(key);

        // Guard отвечает до DTO и сервиса, поэтому фиктивные id/тело не влияют на 403.
        const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string;
        const path = `/api/v2/${controllerPath}/${methodPath}`.replace(/\/+/g, "/").replace(/:[^/]+/g, "test-id");
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
        const client = request(app.getHttpServer());
        const response = method === RequestMethod.GET ? await client.get(path).set("Cookie", cookie) :
          method === RequestMethod.POST ? await client.post(path).set("Cookie", cookie).set("Origin", TEST_APP_URL).send({}) :
          method === RequestMethod.PUT ? await client.put(path).set("Cookie", cookie).set("Origin", TEST_APP_URL).send({}) :
          method === RequestMethod.PATCH ? await client.patch(path).set("Cookie", cookie).set("Origin", TEST_APP_URL).send({}) :
          await client.delete(path).set("Cookie", cookie).set("Origin", TEST_APP_URL);
        expect(response.status, key).toBe(403);
      }
    }

    expect(seen.sort()).toEqual(manifest);
    expect(denied.sort()).toEqual([...closed].sort());
  });
});
