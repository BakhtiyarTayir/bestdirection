import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminDashboardQueryDto } from "./dto/admin-dashboard.dto";

/**
 * Главная панель администратора: деньги за месяц, занятия «сегодня» и
 * список «требует внимания». Деньги видит только администратор — то же
 * правило, что у /finance, /billing, /salary.
 */
@Controller("dashboard/admin")
export class AdminDashboardController {
  constructor(private readonly adminDashboard: AdminDashboardService) {}

  @CheckPolicies((ability) => ability.can("manage", "Billing"))
  @Get()
  overview(@Query() query: AdminDashboardQueryDto, @CurrentUser() actor: SessionUser) {
    return this.adminDashboard.overview(query.branchId, actor);
  }
}
