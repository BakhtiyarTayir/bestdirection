import { Body, Controller, Get, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { EnrollmentRequestsService } from "./enrollment-requests.service";

class CourseIdDto extends createZodDto(z.object({ courseId: z.string().min(1).max(40) })) {}
class RequestIdDto extends createZodDto(z.object({ requestId: z.string().min(1).max(40) })) {}

@Controller("enrollment-requests")
export class EnrollmentRequestsController {
  constructor(private readonly requests: EnrollmentRequestsService) {}

  /** Каталог и самозапись — только ученику: остальным записывают вручную. */
  @CheckPolicies((ability) => ability.can("read", "Catalog"))
  @Get("catalog")
  catalog(@CurrentUser() student: SessionUser) {
    return this.requests.catalog(student);
  }

  @CheckPolicies((ability) => ability.can("create", "EnrollmentRequest"))
  @Post("free-enroll")
  enrollInFree(@Body() body: CourseIdDto, @CurrentUser() student: SessionUser) {
    return this.requests.enrollInFreeCourse(body.courseId, student);
  }

  @CheckPolicies((ability) => ability.can("create", "EnrollmentRequest"))
  @Post()
  async request(@Body() body: CourseIdDto, @CurrentUser() student: SessionUser) {
    await this.requests.requestEnrollment(body.courseId, student);
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("update", "EnrollmentRequest"))
  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.requests.list(user);
  }

  /** Бейдж в сайдбаре. */
  @CheckPolicies((ability) => ability.can("update", "EnrollmentRequest"))
  @Get("count")
  count(@CurrentUser() user: SessionUser) {
    return this.requests.pendingCount(user);
  }

  @CheckPolicies((ability) => ability.can("update", "EnrollmentRequest"))
  @Post("approve")
  async approve(@Body() body: RequestIdDto, @CurrentUser() actor: SessionUser) {
    await this.requests.approve(body.requestId, actor);
    return { ok: true };
  }

  @CheckPolicies((ability) => ability.can("update", "EnrollmentRequest"))
  @Post("reject")
  async reject(@Body() body: RequestIdDto, @CurrentUser() actor: SessionUser) {
    await this.requests.reject(body.requestId, actor);
    return { ok: true };
  }
}
