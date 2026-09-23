import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { TrashController } from "./trash.controller";
import { TrashService } from "./trash.service";

@Module({
  // Восстановление курса из Корзины фиксирует закрытые месяцы начислений и
  // зарплаты — нужны реестры обоих
  imports: [BillingModule, SalaryModule],
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
