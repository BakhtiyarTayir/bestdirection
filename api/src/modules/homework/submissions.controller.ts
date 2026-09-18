import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentAbility, CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import type { AppAbility } from "../../common/policies/abilities";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { ReviewSubmissionDto } from "./dto/submission.dto";
import { SubmissionsService } from "./submissions.service";

/** Проверка работ: очередь, история и разбор. Только персонал. */
@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Get("pending")
  pending(@CurrentUser() user: SessionUser) {
    return this.submissions.pending(user);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Get("history")
  history(@CurrentUser() user: SessionUser) {
    return this.submissions.history(user);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Get(":id")
  forReview(@Param("id") id: string, @CurrentAbility() ability: AppAbility) {
    return this.submissions.forReview(id, ability);
  }

  @CheckPolicies((ability) => ability.can("update", "Course"))
  @Post(":id/review")
  review(
    @Param("id") id: string,
    @Body() body: ReviewSubmissionDto,
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() actor: SessionUser
  ) {
    return this.submissions.review(id, body, ability, actor);
  }
}
