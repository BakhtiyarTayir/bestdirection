import { Controller, Get } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { TeacherDashboardService } from "./teacher-dashboard.service";

/**
 * Панель преподавателя (план дашборда, раздел 2). Доступ ограничивает сам
 * сервис — не @CheckPolicies(ability), а проверка роли: администратору
 * здесь не 403 через права (can("read", ...) у него есть на всё через
 * can("manage", "all")), а осознанный отказ — у него своя панель.
 */
@Controller("dashboard/teacher")
export class TeacherDashboardController {
  constructor(private readonly teacherDashboard: TeacherDashboardService) {}

  @Authenticated()
  @Get()
  summary(@CurrentUser() user: SessionUser) {
    return this.teacherDashboard.summary(user);
  }
}
