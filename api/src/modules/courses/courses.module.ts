import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { CourseCompareService } from "./course-compare.service";
import { CourseCopyService } from "./course-copy.service";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

// BillingModule нужен из-за цены курса: её смена обязана сначала заморозить
// закрытые месяцы начислений. SalaryModule — то же самое для зарплаты при
// отчислении ученика (unenrollStudent): её заморозка идёт сразу после
// биллинговой (план зарплат, 5.4).
@Module({
  imports: [BillingModule, SalaryModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseCopyService, CourseCompareService],
})
export class CoursesModule {}
