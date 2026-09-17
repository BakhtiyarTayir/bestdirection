import { ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerGuard, getOptionsToken, getStorageToken } from "@nestjs/throttler";
import type { ThrottlerModuleOptions, ThrottlerStorage } from "@nestjs/throttler";
import { ENV, type Env } from "../../config/env";
import type { ApiRequest } from "../auth/api-request";
import { isValidInternalToken } from "./internal-token";

/**
 * Ограничение частоты по IP клиента (за Caddy — из X-Forwarded-For, см.
 * trust proxy в app.setup.ts). Хранилище в памяти процесса: Redis не
 * поднимаем, инстанс один.
 *
 * Серверные вызовы из web с внутренним токеном не ограничиваются: все они
 * приходят с одного адреса контейнера web и упёрлись бы в общий лимит.
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(ENV) private readonly env: Env
  ) {
    super(options, storage, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    return isValidInternalToken(request.headers["x-internal-token"], this.env.INTERNAL_TOKEN);
  }
}
