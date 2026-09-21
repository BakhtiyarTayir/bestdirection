import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { CourseCompareService } from "./course-compare.service";
import { CourseCopyService } from "./course-copy.service";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

// BillingModule нужен из-за цены курса: её смена обязана сначала заморозить
// закрытые месяцы начислений. SalaryModule раньше был нужен только для
// отчисления через маршрут курса (unenrollStudent) — тот маршрут убран (план
// «Учеников добавляют только в группу», этап 5-бис) — но вернулся: цена
// курса — вход расчёта зарплаты ровно так же, как цена группы (база для
// групп без своей цены), и её смену тоже нужно замораживать (план зарплат,
// 5.4). SalaryModule ни на CoursesModule, ни на GroupsModule не завязан —
// циклического импорта нет.
@Module({
  imports: [BillingModule, SalaryModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseCopyService, CourseCompareService],
})
export class CoursesModule {}
