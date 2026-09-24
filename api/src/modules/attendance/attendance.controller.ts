import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Authenticated, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { AttendanceService } from "./attendance.service";
import {
  AttendanceGroupsQueryDto,
  CourseQueryDto,
  CreateSessionDto,
  StudentQueryDto,
  TeacherAttendanceDto,
  TeacherReportQueryDto,
  UpdateRecordsDto,
} from "./dto/attendance.dto";
import { TeacherAttendanceService } from "./teacher-attendance.service";

@Controller("attendance")
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly teachers: TeacherAttendanceService
  ) {}

  /**
   * Занятия курса. Ученику отдаются только его собственные отметки, поэтому
   * маршрут открыт любому вошедшему, а сужает выборку сам сервис. groupId —
   * журнал одной группы (план «Журнал посещаемости по группам», п.1).
   */
  @Authenticated()
  @Get("sessions")
  sessions(@Query() query: CourseQueryDto, @CurrentUser() user: SessionUser) {
    return this.attendance.sessions(query.courseId, user, query.groupId);
  }

  /**
   * Группы для раздела «Посещаемость» (план, п.1): группа, курс, филиал,
   * преподаватель и «отмечено N из M» за месяц. Тот же маршрут отдаёт и
   * одну группу (query.groupId) — сводку для шапки её журнала.
   */
  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("groups")
  groups(@Query() query: AttendanceGroupsQueryDto, @CurrentUser() user: SessionUser) {
    return this.attendance.groupsOverview(query, user);
  }

  @CheckPolicies((ability) => ability.can("manage", "Attendance"))
  @Post("sessions")
  createSession(@Body() body: CreateSessionDto, @CurrentUser() actor: SessionUser) {
    return this.attendance.createSession(body, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "Attendance"))
  @Patch("sessions/:id/records")
  async updateRecords(
    @Param("id") id: string,
    @Body() body: UpdateRecordsDto,
    @CurrentUser() actor: SessionUser
  ) {
    await this.attendance.updateRecords(id, body, actor);
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("manage", "Attendance"))
  @Delete("sessions/:id")
  async deleteSession(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.attendance.deleteSession(id, actor);
    return { ok: true };
  }

  // Матрица посещаемости содержит контакты учеников — только персоналу.
  // groupId сужает её до одной группы (план, п.1)
  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("report")
  report(@Query() query: CourseQueryDto, @CurrentUser() user: SessionUser) {
    return this.attendance.report(query.courseId, user, query.groupId);
  }

  /**
   * Посещаемость одного ученика: сам ученик, его родитель или персонал.
   * Родство проверяет сервис (аудит 2.4).
   */
  @Authenticated()
  @Get("student")
  studentAttendance(@Query() query: StudentQueryDto, @CurrentUser() user: SessionUser) {
    return this.attendance.studentAttendance(query.studentId, user);
  }

  @CheckPolicies((ability) => ability.can("read", "TeacherAttendance"))
  @Get("teachers/report")
  teacherReport(@Query() query: TeacherReportQueryDto, @CurrentUser() user: SessionUser) {
    return this.teachers.report(query, user);
  }

  @CheckPolicies((ability) => ability.can("read", "TeacherAttendance"))
  @Get("teachers/sessions")
  teacherSessions(@Query() query: TeacherReportQueryDto, @CurrentUser() user: SessionUser) {
    return this.teachers.sessions(query, user);
  }

  @CheckPolicies((ability) => ability.can("manage", "Attendance"))
  @Post("sessions/:id/teacher")
  async setTeacherAttendance(
    @Param("id") id: string,
    @Body() body: TeacherAttendanceDto,
    @CurrentUser() actor: SessionUser
  ) {
    await this.teachers.setAttendance(id, body, actor);
    return { ok: true };
  }
}
