import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { SalaryModule } from "../salary/salary.module";
import { HomeworkStatisticsService } from "./homework-statistics.service";
import { ProfileController } from "./profile.controller";
import { TelegramLinkService } from "./telegram-link.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

// SalaryModule: смена ставки преподавателя (salaryPercentBp) — вход
// расчёта зарплаты, требует заморозки закрытых месяцев перед записью.
// BillingModule: деактивация ученика останавливает начисления — требует
// BillingLedgerService.freezeClosedMonths ПЕРЕД тем же для зарплаты.
@Module({
  imports: [SalaryModule, BillingModule],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, HomeworkStatisticsService, TelegramLinkService],
})
export class UsersModule {}
