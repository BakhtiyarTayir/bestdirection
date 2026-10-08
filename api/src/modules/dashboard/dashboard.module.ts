import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { FinanceModule } from "../finance/finance.module";
import { ParentsModule } from "../parents/parents.module";
import { SalaryModule } from "../salary/salary.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { HostingService } from "./hosting.service";
import { StudentDashboardController } from "./student-dashboard.controller";
import { StudentDashboardService } from "./student-dashboard.service";
import { TeacherDashboardController } from "./teacher-dashboard.controller";
import { TeacherDashboardService } from "./teacher-dashboard.service";

// По контроллеру на роль (план дашборда, раздел 0). Деньги главная панель
// берёт из FinanceModule/BillingModule/SalaryModule — своего расчёта нет;
// ParentsModule даёт родителю его детей (ParentStudent).
@Module({
  imports: [FinanceModule, BillingModule, SalaryModule, ParentsModule],
  controllers: [DashboardController, AdminDashboardController, TeacherDashboardController, StudentDashboardController],
  providers: [DashboardService, HostingService, AdminDashboardService, TeacherDashboardService, StudentDashboardService],
})
export class DashboardModule {}
