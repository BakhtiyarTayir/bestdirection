import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

// Отчёт «Финансы»: касса и начисления учеников (BillingModule) минус
// выплаты и начисленная зарплата (SalaryModule). Своих данных не хранит.
// FinanceService экспортируется: главной панели администратора нужна
// прибыль по кассе и сравнение с прошлым месяцем, а пересчитывать деньги
// своим кодом там нельзя (план дашборда, 1.1).
@Module({
  imports: [BillingModule, SalaryModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
