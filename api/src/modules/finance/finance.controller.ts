import { Controller, Get, Query } from "@nestjs/common";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { FinanceQueryDto } from "./dto/finance.dto";
import { FinanceService } from "./finance.service";

@Controller("finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // Деньги центра видит только администратор — то же правило, что у оплат
  @CheckPolicies((ability) => ability.can("manage", "Billing"))
  @Get()
  overview(@Query() query: FinanceQueryDto) {
    return this.finance.overview(query);
  }
}
