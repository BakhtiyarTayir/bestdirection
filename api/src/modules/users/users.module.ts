import { Module } from "@nestjs/common";
import { SalaryModule } from "../salary/salary.module";
import { HomeworkStatisticsService } from "./homework-statistics.service";
import { ProfileController } from "./profile.controller";
import { TelegramLinkService } from "./telegram-link.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

// SalaryModule: смена ставки преподавателя (salaryPercentBp) — вход
// расчёта зарплаты, требует заморозки закрытых месяцев перед записью.
@Module({
  imports: [SalaryModule],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, HomeworkStatisticsService, TelegramLinkService],
})
export class UsersModule {}
