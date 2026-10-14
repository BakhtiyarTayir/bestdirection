import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AdjustmentsService } from "./adjustments.service";
import { PayoutsService } from "./payouts.service";
import { SalaryController } from "./salary.controller";
import { SalaryService } from "./salary.service";

// Зарплата преподавателей: начисления, журнал выплат и журнал премий/штрафов. BillingModule
// экспортирует BillingLedgerService — зарплата берёт базу из уже
// зафиксированных начислений учеников, не пересчитывая биллинг заново.
// SalaryService экспортируется: groups/users/courses вызывают
// freezeClosedMonths перед изменением входов расчёта (план зарплат, 5.4).
@Module({
  imports: [BillingModule],
  controllers: [SalaryController],
  providers: [SalaryService, PayoutsService, AdjustmentsService],
  exports: [SalaryService],
})
export class SalaryModule {}
