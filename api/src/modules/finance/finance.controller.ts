import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import type { AppAbility } from "../../common/policies/abilities";
import { CreateHandoverDto, FinanceQueryDto, HandoverFiltersDto } from "./dto/finance.dto";
import { FinanceService } from "./finance.service";
import { HandoversService } from "./handovers.service";

// Деньги центра видит только администратор — то же правило, что у оплат
const adminOnly = (ability: AppAbility) => ability.can("manage", "Billing");

@Controller("finance")
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly handovers: HandoversService
  ) {}

  @CheckPolicies(adminOnly)
  @Get()
  overview(@Query() query: FinanceQueryDto) {
    return this.finance.overview(query);
  }

  // Журнал сдачи прибыли — маршруты "handovers" не пересекаются с корнем "finance"
  @CheckPolicies(adminOnly)
  @Get("handovers")
  handoversList(@Query() query: HandoverFiltersDto) {
    return this.handovers.list(query);
  }

  @CheckPolicies(adminOnly)
  @Post("handovers")
  createHandover(@Body() body: CreateHandoverDto, @CurrentUser() actor: SessionUser) {
    return this.handovers.create(body, actor);
  }

  @CheckPolicies(adminOnly)
  @Delete("handovers/:id")
  async deleteHandover(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    await this.handovers.remove(id, actor);
    return { ok: true };
  }
}
