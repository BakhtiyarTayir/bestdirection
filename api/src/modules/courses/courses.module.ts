import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { CourseCompareService } from "./course-compare.service";
import { CourseCopyService } from "./course-copy.service";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

// BillingModule нужен из-за цены курса: её смена обязана сначала заморозить
// закрытые месяцы начислений. SalaryModule раньше был нужен для отчисления
// через маршрут курса (unenrollStudent) — тот маршрут убран (план «Учеников
// добавляют только в группу», этап 5-бис), заморозка зарплаты при отчислении
// теперь только в GroupsService.
@Module({
  imports: [BillingModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseCopyService, CourseCompareService],
})
export class CoursesModule {}
