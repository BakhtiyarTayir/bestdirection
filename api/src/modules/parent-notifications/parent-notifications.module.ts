import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { ParentNotifyService } from "./parent-notify.service";
import { WeeklyDigestService } from "./weekly-digest.service";

/**
 * Уведомления родителям об успеваемости ребёнка (план PLAN-PARENT-PROGRESS-2026-09-24,
 * раздел 2): пропуск занятия и проверенное задание — точечно, из
 * AttendanceModule и HomeworkModule; еженедельная сводка — по расписанию
 * (@nestjs/schedule, регистрируется в AppModule через ScheduleModule.forRoot()).
 *
 * BillingModule — сводке нужен studentBilling() для долга, своего расчёта
 * денег здесь нет и не должно быть.
 */
@Module({
  imports: [BillingModule],
  providers: [ParentNotifyService, WeeklyDigestService],
  // WeeklyDigestService — ещё и боту: команда /progress у родителя
  exports: [ParentNotifyService, WeeklyDigestService],
})
export class ParentNotificationsModule {}
