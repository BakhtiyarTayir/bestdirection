import { Controller, Get } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { StudentDashboardService } from "./student-dashboard.service";

/**
 * Главная ученика и родителя. Роли внутри сервиса, а не через CheckPolicies:
 * права здесь не «что можно с моделью», а «сузить до себя / своих детей» —
 * то же решение, что у SubmissionsService.prepareAttempt (ручная проверка
 * роли), а не отдельный субъект CASL ради одного маршрута.
 */
@Controller("dashboard/student")
export class StudentDashboardController {
  constructor(private readonly dashboard: StudentDashboardService) {}

  @Authenticated()
  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.dashboard.forUser(user);
  }
}
