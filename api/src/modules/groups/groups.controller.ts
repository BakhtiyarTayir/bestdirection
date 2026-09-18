import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import {
  AddStudentsDto,
  CourseIdQueryDto,
  CreateGroupDto,
  MoveStudentDto,
  RemoveStudentQueryDto,
  UpdateGroupDto,
} from "./dto/group.dto";
import { GroupStatisticsService } from "./group-statistics.service";
import { GroupsService } from "./groups.service";

// Состав группы — это контакты учеников, поэтому чтение требует того же права,
// что справочник людей (аудит 2.3): персонал да, ученик и родитель нет.
@Controller("groups")
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly statistics: GroupStatisticsService
  ) {}

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get()
  all(@CurrentUser() user: SessionUser) {
    return this.groups.all(user);
  }

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("by-course")
  byCourse(@Query() query: CourseIdQueryDto) {
    return this.groups.byCourse(query.courseId);
  }

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("ungrouped-students")
  ungroupedStudents(@Query() query: CourseIdQueryDto) {
    return this.groups.ungroupedStudents(query.courseId);
  }

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get("teacher-options")
  teacherOptions() {
    return this.groups.teacherOptions();
  }

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get(":id")
  details(@Param("id") id: string) {
    return this.groups.details(id);
  }

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get(":id/available-students")
  availableStudents(@Param("id") id: string) {
    return this.groups.availableStudents(id);
  }

  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get(":id/statistics")
  statistics_(@Param("id") id: string) {
    return this.statistics.build(id);
  }

  @CheckPolicies((ability) => ability.can("create", "Group"))
  @Post()
  create(
    @Body() body: CreateGroupDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.groups.create(body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("update", "Group"))
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateGroupDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.groups.update(id, body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("delete", "Group"))
  @Delete(":id")
  remove(
    @Param("id") id: string,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.groups.remove(id, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("update", "Group"))
  @Post(":id/toggle-active")
  toggleActive(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.groups.toggleActive(id, ability);
  }

  @CheckPolicies((ability) => ability.can("update", "Group"))
  @Post(":id/students")
  addStudents(
    @Param("id") id: string,
    @Body() body: AddStudentsDto,
    @CurrentAbility() ability: AppAbility
  ) {
    return this.groups.addStudents(id, body.studentIds, ability);
  }

  @CheckPolicies((ability) => ability.can("update", "Group"))
  @Delete(":id/students/:studentId")
  removeStudent(
    @Param("id") id: string,
    @Param("studentId") studentId: string,
    @Query() query: RemoveStudentQueryDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.groups.removeStudent(id, studentId, query.alsoUnenroll, ability, actor);
  }

  /** Перевод ученика в эту группу из другой (или из «без группы»). */
  @CheckPolicies((ability) => ability.can("update", "Group"))
  @Post(":id/move-student")
  moveStudent(
    @Param("id") id: string,
    @Body() body: MoveStudentDto,
    @CurrentAbility() ability: AppAbility
  ) {
    return this.groups.moveStudent(id, body.studentId, body.courseId, ability);
  }
}
