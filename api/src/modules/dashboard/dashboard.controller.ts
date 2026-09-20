import { Controller, Get } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Сводка «для меня»: состав зависит от роли вызывающего. */
  @Authenticated()
  @Get("summary")
  summary(@CurrentUser() user: SessionUser) {
    return this.dashboard.summary(user);
  }
}
