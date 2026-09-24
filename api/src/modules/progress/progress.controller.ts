import { Controller, Get, Param, Query } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { ProgressQueryDto } from "./dto/progress.dto";
import { ProgressService } from "./progress.service";

@Controller("progress")
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /**
   * Успеваемость ученика: сам ученик, его родитель, персонал. Родство и
   * лестница «педагог группы → педагог курса» проверяются в сервисе — как у
   * AttendanceController.studentAttendance, маршрут открыт любому вошедшему.
   */
  @Authenticated()
  @Get("students/:studentId")
  forStudent(
    @Param("studentId") studentId: string,
    @Query() query: ProgressQueryDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.progress.forStudent(studentId, user, query.month);
  }
}
