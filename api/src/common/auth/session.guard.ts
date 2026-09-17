import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ENV, type Env } from "../../config/env";
import { AbilityFactory } from "../policies/abilities";
import type { ApiRequest } from "./api-request";
import { IS_PUBLIC_KEY } from "./decorators";
import { readSessionUserId } from "./session-cookie";
import { SessionUserCache } from "./session-user.cache";

/** Второй глобальный guard: кто пришёл. Без сессии — 401, кроме @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: SessionUserCache,
    private readonly abilities: AbilityFactory,
    @Inject(ENV) private readonly env: Env
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<ApiRequest>();
    const userId = await readSessionUserId(request.cookies, this.env.AUTH_SECRET);
    const user = userId ? await this.users.get(userId) : null;
    if (!user) throw new UnauthorizedException("unauthorized");

    request.user = user;
    request.ability = this.abilities.createForUser(user);
    return true;
  }
}
