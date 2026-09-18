import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

// BillingModule нужен из-за цены курса: её смена обязана сначала заморозить
// закрытые месяцы начислений.
@Module({
  imports: [BillingModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
