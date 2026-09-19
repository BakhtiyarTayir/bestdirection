import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ENV, type Env } from "../../config/env";
import { IS_WEBHOOK_KEY } from "../auth/decorators";
import type { ApiRequest } from "../auth/api-request";
import { isValidInternalToken } from "./internal-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Первый глобальный guard: защита от CSRF. Server Actions в Next сверяют
 * Origin сами, а при переходе на REST эта защита пропадает — возвращаем её.
 *
 * Изменяющий запрос принимается, если Origin совпадает с адресом кабинета или
 * лендинга, либо если Origin нет, но есть верный X-Internal-Token (серверный
 * вызов из web).
 * Origin: null (песочница, редирект) не совпадает ни с чем — отказ.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  /** Свои источники: кабинет и лендинг. Оба ходят на одни и те же маршруты. */
  private readonly allowedOrigins: Set<string>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector
  ) {
    this.allowedOrigins = new Set([new URL(env.APP_URL).origin]);
    if (env.MARKETING_URL) this.allowedOrigins.add(new URL(env.MARKETING_URL).origin);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    // Вебхуки Telegram и Eskiz приходят без Origin и проверяют себя сами
    const isWebhook = this.reflector.getAllAndOverride<boolean>(IS_WEBHOOK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isWebhook) return true;

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (this.allowedOrigins.has(origin)) return true;
      throw new ForbiddenException("forbiddenOrigin");
    }

    if (isValidInternalToken(request.headers["x-internal-token"], this.env.INTERNAL_TOKEN)) return true;
    throw new ForbiddenException("forbiddenOrigin");
  }
}
