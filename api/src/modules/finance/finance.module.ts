import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

// Отчёт «Финансы»: касса и начисления учеников (BillingModule) минус
// выплаты и начисленная зарплата (SalaryModule). Своих данных не хранит.
@Module({
  imports: [BillingModule, SalaryModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
