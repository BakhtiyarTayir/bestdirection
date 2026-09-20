import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { GroupStatisticsService } from "./group-statistics.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

// BillingModule: цена, даты и расписание группы — входы начисления, их смена
// обязана сначала заморозить закрытые месяцы. SalaryModule — то же самое для
// зарплаты преподавателя: она опирается на начисления, поэтому её заморозка
// вызывается сразу после биллинговой (план зарплат, 5.4).
@Module({
  imports: [BillingModule, SalaryModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupStatisticsService],
})
export class GroupsModule {}
