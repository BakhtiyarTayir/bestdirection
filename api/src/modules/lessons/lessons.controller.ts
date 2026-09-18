import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Authenticated, CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import {
  CourseQueryDto,
  CourseSlugQueryDto,
  CreateLessonDto,
  LessonProgressDto,
  UpdateLessonDto,
} from "./dto/lesson.dto";
import { LessonsService } from "./lessons.service";
import { ProgressService } from "./progress.service";

/**
 * Чтение открыто любому вошедшему: черновики отсекают права, а не роль.
 * Изменения — только в своих курсах.
 */
@Controller("lessons")
export class LessonsController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly progress: ProgressService
  ) {}

  @Authenticated()
  @Get()
  list(@Query() query: CourseQueryDto, @CurrentAbility() ability: AppAbility) {
    return this.lessons.list(query.courseId, ability);
  }

  @Authenticated()
  @Get("nav")
  nav(
    @Query() query: CourseSlugQueryDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: SessionUser
  ) {
    return this.lessons.courseNav(query.courseSlug, ability, user);
  }

  @Authenticated()
  @Get("progress")
  courseProgress(@Query() query: CourseQueryDto, @CurrentUser() user: SessionUser) {
    return this.progress.courseProgress(query.courseId, user);
  }

  @Authenticated()
  @Get("slug/:courseId/:lessonSlug")
  idBySlug(
    @Param("courseId") courseId: string,
    @Param("lessonSlug") lessonSlug: string,
    @CurrentAbility() ability: AppAbility
  ) {
    return this.lessons.idBySlug(courseId, lessonSlug, ability);
  }

  @Authenticated()
  @Get(":id")
  byId(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.lessons.byId(id, ability);
  }

  @Authenticated()
  @Get(":id/progress")
  lessonProgress(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.progress.lessonProgress(id, user);
  }

  /**
   * Просмотр видео: ученик отмечает, докуда досмотрел. POST, а не PATCH:
   * плеер шлёт это через navigator.sendBeacon, который умеет только POST.
   */
  @Authenticated()
  @Post(":id/progress")
  updateProgress(
    @Param("id") id: string,
    @Body() body: LessonProgressDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.progress.update(id, body, user);
  }

  @Authenticated()
  @Post(":id/complete")
  complete(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.progress.markComplete(id, user);
  }

  /**
   * Отметка «пользователь на сайте». Плеер и кабинет шлют её фоном, поэтому
   * маршрут дешёвый и доступен любому вошедшему.
   */
  @Authenticated()
  @Post("presence/ping")
  async ping(@CurrentUser() user: SessionUser) {
    await this.progress.touchPresence(user);
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("read", "UnpublishedContent"))
  @Post()
  create(
    @Body() body: CreateLessonDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.lessons.create(body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("read", "UnpublishedContent"))
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateLessonDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.lessons.update(id, body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("read", "UnpublishedContent"))
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    await this.lessons.remove(id, ability, actor);
    return { ok: true };
  }
}
