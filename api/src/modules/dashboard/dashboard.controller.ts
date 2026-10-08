import { Controller, Get, Query } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { DashboardService } from "./dashboard.service";
import { AdminDashboardQueryDto } from "./dto/admin-dashboard.dto";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Сводка «для меня»: состав зависит от роли вызывающего. branchId — только для администратора. */
  @Authenticated()
  @Get("summary")
  summary(@Query() query: AdminDashboardQueryDto, @CurrentUser() user: SessionUser) {
    return this.dashboard.summary(user, query.branchId);
  }
}
