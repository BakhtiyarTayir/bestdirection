import { Controller, Get } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";

@Controller("me")
export class MeController {
  /**
   * Кто вошёл — с ролью из БД, а не из токена. Первое доказательство, что
   * api читает сессию web: этап 1 закрыт, когда это работает в проде.
   */
  @Authenticated()
  @Get()
  me(@CurrentUser() user: SessionUser) {
    return user;
  }
}
