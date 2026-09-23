import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { ParentsModule } from "../parents/parents.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { StudentDashboardController } from "./student-dashboard.controller";
import { StudentDashboardService } from "./student-dashboard.service";

// Несколько контроллеров в одном модуле — по одному на роль (раздел 0 плана
// дашборда), чтобы ветки трёх агентов сливались без конфликтов. BillingModule
// даёт студенческую часть BillingService.studentBilling, ParentsModule — детей
// родителя (ParentStudent).
@Module({
  imports: [BillingModule, ParentsModule],
  controllers: [DashboardController, StudentDashboardController],
  providers: [DashboardService, StudentDashboardService],
})
export class DashboardModule {}
