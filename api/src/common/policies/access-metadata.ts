import type { Reflector } from "@nestjs/core";
import { IS_AUTHENTICATED_KEY, IS_PUBLIC_KEY } from "../auth/decorators";
import { CHECK_POLICIES_KEY, type PolicyHandler } from "./check-policies.decorator";

export type AccessRule =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "policies"; handlers: PolicyHandler[] }
  | { kind: "none" };

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type Target = Function;

/** Какое правило доступа объявлено у обработчика (или у всего контроллера). */
export function readAccessRule(reflector: Reflector, handler: Target, controller: Target): AccessRule {
  const targets = [handler, controller];
  if (reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return { kind: "public" };
  if (reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, targets)) return { kind: "authenticated" };
  const handlers = reflector.getAllAndOverride<PolicyHandler[] | undefined>(CHECK_POLICIES_KEY, targets);
  if (handlers && handlers.length > 0) return { kind: "policies", handlers };
  return { kind: "none" };
}
