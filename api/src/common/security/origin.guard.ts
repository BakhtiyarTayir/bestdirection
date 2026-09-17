import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";
import type { ApiRequest } from "../auth/api-request";
import { isValidInternalToken } from "./internal-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Первый глобальный guard: защита от CSRF. Server Actions в Next сверяют
 * Origin сами, а при переходе на REST эта защита пропадает — возвращаем её.
 *
 * Изменяющий запрос принимается, если Origin совпадает с адресом web, либо если
 * Origin нет, но есть верный X-Internal-Token (серверный вызов из web).
 * Origin: null (песочница, редирект) не совпадает ни с чем — отказ.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly appOrigin: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.appOrigin = new URL(env.APP_URL).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (origin === this.appOrigin) return true;
      throw new ForbiddenException("forbiddenOrigin");
    }

    if (isValidInternalToken(request.headers["x-internal-token"], this.env.INTERNAL_TOKEN)) return true;
    throw new ForbiddenException("forbiddenOrigin");
  }
}
