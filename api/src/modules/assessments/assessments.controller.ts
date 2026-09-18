import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Authenticated, CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { AssessmentsService } from "./assessments.service";
import {
  CourseQueryDto,
  CreateAssessmentDto,
  CreateQuestionDto,
  LessonQueryDto,
  StudentQueryDto,
  SubmitAttemptDto,
  UpdateAssessmentDto,
  UpdateQuestionDto,
} from "./dto/assessment.dto";

/**
 * Чтение открыто любому вошедшему, а что именно он увидит, решают права:
 * черновики — только персоналу, правильные ответы — тоже (аудит 2.4).
 */
@Controller("assessments")
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Authenticated()
  @Get()
  byCourse(@Query() query: CourseQueryDto, @CurrentAbility() ability: AppAbility) {
    return this.assessments.byCourse(query.courseId, query.type, ability);
  }

  @Authenticated()
  @Get("by-lesson")
  byLesson(@Query() query: LessonQueryDto, @CurrentAbility() ability: AppAbility) {
    return this.assessments.byLesson(query.lessonId, ability);
  }

  /** Результаты ученика: сам, его родитель или персонал. */
  @Authenticated()
  @Get("results")
  studentResults(@Query() query: StudentQueryDto, @CurrentUser() user: SessionUser) {
    return this.assessments.studentResults(query.studentId, user);
  }

  /** Допуск к экзаменам курса целиком — для списка экзаменов. */
  @Authenticated()
  @Get("eligibility")
  courseEligibility(@Query("courseId") courseId: string, @CurrentUser() user: SessionUser) {
    return this.assessments.courseEligibility(courseId, user);
  }

  @Authenticated()
  @Get(":id")
  byId(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.assessments.byId(id, ability);
  }

  @Authenticated()
  @Get(":id/eligibility")
  eligibility(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.assessments.eligibility(id, user);
  }

  @Authenticated()
  @Get(":id/attempts/mine")
  myAttempts(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.assessments.myAttempts(id, user);
  }

  @Authenticated()
  @Get(":id/attempts/best")
  myBestAttempt(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.assessments.myBestAttempt(id, user);
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Get(":id/attempts")
  attempts(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.assessments.attempts(id, ability);
  }

  /** Начало попытки: отсюда сервер знает, когда истекает время. */
  @Authenticated()
  @Post(":id/attempts")
  startAttempt(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.assessments.startAttempt(id, user);
  }

  @Authenticated()
  @Post("attempts/:attemptId/submit")
  submitAttempt(
    @Param("attemptId") attemptId: string,
    @Body() body: SubmitAttemptDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.assessments.submitAttempt(attemptId, body, user);
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Post()
  create(
    @Body() body: CreateAssessmentDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.assessments.create(body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateAssessmentDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.assessments.update(id, body, ability, actor);
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    await this.assessments.remove(id, ability, actor);
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Post("questions")
  addQuestion(@Body() body: CreateQuestionDto, @CurrentAbility() ability: AppAbility) {
    return this.assessments.addQuestion(body, ability);
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Patch("questions/:id")
  updateQuestion(
    @Param("id") id: string,
    @Body() body: UpdateQuestionDto,
    @CurrentAbility() ability: AppAbility
  ) {
    return this.assessments.updateQuestion(id, body, ability);
  }

  @CheckPolicies((ability) => ability.can("read", "AssessmentAnswers"))
  @Delete("questions/:id")
  async deleteQuestion(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    await this.assessments.deleteQuestion(id, ability);
    return { ok: true };
  }
}
