import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AbilityFactory } from "../policies/abilities";
import type { ApiRequest } from "./api-request";
import { IS_PUBLIC_KEY } from "./decorators";
import { SESSION_COOKIE, SessionsService } from "./sessions.service";
import { SessionUserCache } from "./session-user.cache";

/** Второй глобальный guard: кто пришёл. Без сессии — 401, кроме @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: SessionUserCache,
    private readonly abilities: AbilityFactory,
    private readonly sessions: SessionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<ApiRequest>();

    const token = request.cookies?.[SESSION_COOKIE];
    const userId = token ? await this.sessions.userIdFor(token) : null;
    const user = userId ? await this.users.get(userId) : null;
    if (!user) throw new UnauthorizedException("unauthorized");

    request.user = user;
    request.ability = this.abilities.createForUser(user);
    return true;
  }
}
