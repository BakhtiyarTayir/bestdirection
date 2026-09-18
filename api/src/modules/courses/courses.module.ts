import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { CourseCompareService } from "./course-compare.service";
import { CourseCopyService } from "./course-copy.service";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

// BillingModule нужен из-за цены курса: её смена обязана сначала заморозить
// закрытые месяцы начислений.
@Module({
  imports: [BillingModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseCopyService, CourseCompareService],
})
export class CoursesModule {}
