import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { AppAbility } from "../policies/abilities";
import type { ApiRequest } from "./api-request";
import type { SessionUser } from "./session-user";

export const IS_PUBLIC_KEY = "access:public";
export const IS_AUTHENTICATED_KEY = "access:authenticated";

/** Маршрут без входа. Используется явно и редко: лендинг, вебхуки, health. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Любой вошедший пользователь, без проверки прав на объект. Для того, что
 * человек делает только с собой: свой профиль, свои настройки.
 */
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest<ApiRequest>().user!
);

export const CurrentAbility = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppAbility => ctx.switchToHttp().getRequest<ApiRequest>().ability!
);
