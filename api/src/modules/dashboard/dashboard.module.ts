import { Module } from "@nestjs/common";
import { SalaryModule } from "../salary/salary.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { TeacherDashboardController } from "./teacher-dashboard.controller";
import { TeacherDashboardService } from "./teacher-dashboard.service";

// SalaryModule экспортирует SalaryService — панель преподавателя берёт свою
// зарплату оттуда (teacherDetail), не пересчитывая её заново (план дашборда,
// раздел 2).
@Module({
  imports: [SalaryModule],
  controllers: [DashboardController, TeacherDashboardController],
  providers: [DashboardService, TeacherDashboardService],
})
export class DashboardModule {}
