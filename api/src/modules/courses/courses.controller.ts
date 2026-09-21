import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Authenticated, CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { CourseCompareService } from "./course-compare.service";
import { CourseCopyService } from "./course-copy.service";
import { CoursesService } from "./courses.service";
import {
  CompareQueryDto,
  CopyCourseDto,
  CreateCourseDto,
  EnrolledStudentsQueryDto,
  UpdateCourseDto,
} from "./dto/course.dto";

// Чтение курсов: @Authenticated(), а доступ к конкретным строкам решает
// выборка по правам (accessibleBy). Для родителя правил на курсы нет — список
// приходит пустым, а чужой курс отдаёт 404, как было до переноса.
@Controller("courses")
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly copyService: CourseCopyService,
    private readonly compareService: CourseCompareService
  ) {}

  @Authenticated()
  @Get()
  list(@CurrentAbility() ability: AppAbility, @CurrentUser() user: SessionUser) {
    return this.courses.list(ability, user);
  }

  @CheckPolicies((ability) => ability.can("create", "Course"))
  @Post()
  create(
    @Body() body: CreateCourseDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.courses.create(body, ability, actor);
  }

  /** Каталог для копирования: шаблоны и опубликованные курсы. */
  @CheckPolicies((ability) => ability.can("create", "Course"))
  @Get("for-copy")
  coursesForCopy() {
    return this.copyService.coursesForCopy();
  }

  @CheckPolicies((ability) => ability.can("create", "Course"))
  @Post("copy")
  copy(@Body() body: CopyCourseDto, @CurrentUser() actor: SessionUser) {
    return this.copyService.copy(body.sourceCourseId, actor, { newTitle: body.newTitle });
  }

  /** Сравнение двух курсов — администратору. */
  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get("compare")
  compare(@Query() query: CompareQueryDto) {
    return this.compareService.compare(query.courseAId, query.courseBId);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get("for-comparison")
  coursesForComparison() {
    return this.compareService.coursesForComparison();
  }

  @CheckPolicies((ability) => ability.can("read", "Course"))
  @Get(":id/lineage")
  lineage(@Param("id") id: string) {
    return this.copyService.lineage(id);
  }

  /** Адреса кабинета построены на slug, связи в базе — на id. */
  @Authenticated()
  @Get("slug/:slug")
  idBySlug(@Param("slug") slug: string, @CurrentAbility() ability: AppAbility) {
    return this.courses.idBySlug(ability, slug);
  }

  @Authenticated()
  @Get(":id")
  byId(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.courses.byId(ability, id);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateCourseDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.courses.update(id, body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("delete", "Course"))
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    await this.courses.remove(id, ability, actor);
    return { ok: true };
  }

  // Контакты учеников — только персоналу (аудит 2.3). Запись и отчисление
  // теперь идут только через группу (GroupsService.addStudents/removeStudent,
  // план «Учеников добавляют только в группу», этап 5-бис) — здесь остаётся
  // только чтение состава: его читает и журнал посещаемости.
  @CheckPolicies((ability) => ability.can("read", "UserDirectory"))
  @Get(":id/students")
  enrolledStudents(@Param("id") id: string, @Query() query: EnrolledStudentsQueryDto) {
    return this.courses.enrolledStudents(id, query.groupId);
  }
}
