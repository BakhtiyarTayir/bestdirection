import type { INestApplication } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { readAccessRule } from "../src/common/policies/access-metadata";

/** Маршруты, у которых нет ни @Public(), ни @Authenticated(), ни @CheckPolicies(). */
export function findUnprotectedRoutes(app: INestApplication): string[] {
  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  const unprotected: string[] = [];

  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype as (new (...args: unknown[]) => unknown) | null;
    if (!controller) continue;
    const prototype = controller.prototype as Record<string, unknown>;
    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName] as (...args: unknown[]) => unknown;
      if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
      if (readAccessRule(reflector, handler, controller).kind === "none") {
        unprotected.push(`${controller.name}.${methodName}`);
      }
    }
  }
  return unprotected;
}
