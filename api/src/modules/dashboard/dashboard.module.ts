import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { FinanceModule } from "../finance/finance.module";
import { SalaryModule } from "../salary/salary.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { TeacherDashboardController } from "./teacher-dashboard.controller";
import { TeacherDashboardService } from "./teacher-dashboard.service";

// FinanceModule/BillingModule/SalaryModule — деньги для главной панели
// администратора берутся из них же (план дашборда, 1.1), своего расчёта нет;
// панель преподавателя берёт свою зарплату из SalaryService (teacherDetail).
@Module({
  imports: [FinanceModule, BillingModule, SalaryModule],
  controllers: [DashboardController, AdminDashboardController, TeacherDashboardController],
  providers: [DashboardService, AdminDashboardService, TeacherDashboardService],
})
export class DashboardModule {}
