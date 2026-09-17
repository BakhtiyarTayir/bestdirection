import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiRequest } from "../auth/api-request";
import { readAccessRule } from "./access-metadata";

/**
 * Третий глобальный guard: запрет по умолчанию. Маршрут без @Public(),
 * @Authenticated() или @CheckPolicies(...) отдаёт 403 любому, включая
 * администратора — забытая проверка видна при первом же вызове, а не дырой
 * в проде. Тест test/access-metadata.e2e-spec.ts не даёт такой маршрут собрать.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = readAccessRule(this.reflector, context.getHandler(), context.getClass());

    switch (rule.kind) {
      case "public":
        return true;
      case "authenticated":
        // SessionGuard уже пропустил только вошедших
        return true;
      case "policies": {
        const { ability } = context.switchToHttp().getRequest<ApiRequest>();
        if (ability && rule.handlers.every((handler) => handler(ability))) return true;
        throw new ForbiddenException("forbidden");
      }
      case "none":
        throw new ForbiddenException("forbidden");
    }
  }
}
