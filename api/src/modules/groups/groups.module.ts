import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { GroupStatisticsService } from "./group-statistics.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

// BillingModule: цена, даты и расписание группы — входы начисления, их смена
// обязана сначала заморозить закрытые месяцы.
@Module({
  imports: [BillingModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupStatisticsService],
})
export class GroupsModule {}
