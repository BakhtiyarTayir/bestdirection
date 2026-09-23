import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingLedgerService } from "../billing/billing-ledger.service";
import { addMonths, currentMonthKey, isValidMonth, monthKey, monthRange } from "../billing/domain/billing";
import { SalaryService } from "../salary/salary.service";
import type { FinanceQueryDto } from "./dto/finance.dto";

/** Сколько месяцев показывает таблица помесячной динамики, включая выбранный */
const HISTORY_MONTHS = 12;

/**
 * С какого месяца в системе ведётся учёт денег (реестр начислений, зарплаты,
 * журнал оплат). Раньше — пустые строки, которые только сбивают с толку
 * (решение владельца 2026-09-23).
 */
export const ACCOUNTING_START_MONTH = "2026-09";

export interface FinanceMonth {
  month: string;
  /** Касса: оплаты учеников, принятые в этом месяце (по дате приёма денег) */
  received: number;
  /** Касса: выплаты преподавателям, выданные в этом месяце (по дате выдачи) */
  paidOut: number;
  cashProfit: number;
  /** Начисления: сколько ученики должны были заплатить за этот месяц */
  charged: number;
  /** Начисления: зарплата преподавателей за этот месяц */
  salaryAccrued: number;
  accrualProfit: number;
}

/**
 * Отчёт «Финансы»: сколько центр заработал за вычетом зарплат, в двух
 * вариантах.
 *
 * По кассе — реальные деньги: принятые оплаты минус выданные выплаты, по
 * датам движения денег. Отвечает на вопрос «сколько осталось в кассе».
 *
 * По начислениям — сколько центр заработал бы, если бы все заплатили
 * вовремя: начисления ученикам за месяц минус начисленная за тот же месяц
 * зарплата. Не зависит от того, когда заплатили, и показывает доходность
 * месяца как такового. Расхождение двух вариантов — это долги и авансы.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly ledger: BillingLedgerService,
    private readonly salary: SalaryService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async overview(query: FinanceQueryDto) {
    const month = query.month && isValidMonth(query.month) ? query.month : currentMonthKey();
    const branchId = query.branchId || undefined;
    // Не раньше начала учёта и не больше HISTORY_MONTHS назад; выбранный
    // месяц до начала учёта показывается сам по себе
    const windowStart = addMonths(month, -(HISTORY_MONTHS - 1));
    const firstMonth =
      month < ACCOUNTING_START_MONTH
        ? month
        : windowStart > ACCOUNTING_START_MONTH
          ? windowStart
          : ACCOUNTING_START_MONTH;
    const months = monthRange(firstMonth, month);
    // paidAt хранится полднем UTC, поэтому границы месяца по UTC не режут дни
    const paidAt = {
      gte: new Date(`${firstMonth}-01T00:00:00.000Z`),
      lt: new Date(`${addMonths(month, 1)}-01T00:00:00.000Z`),
    };

    const [payments, payouts, enrollments, accruals] = await Promise.all([
      this.prisma.payment.findMany({
        // Филиал — снимок на оплате, как в журнале оплат
        where: { deletedAt: null, paidAt, ...(branchId ? { branchId } : {}) },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.teacherPayout.findMany({
        // Филиал выплаты — филиал преподавателя на момент выдачи: разбивка
        // по филиалам приблизительная, как и в сводке зарплат
        where: { deletedAt: null, paidAt, ...(branchId ? { branchId } : {}) },
        select: { amount: true, paidAt: true, teacherId: true },
      }),
      this.ledger.loadBillableEnrollments({ branchId }),
      this.salary.accrualsByMonth({ branchId }, month),
    ]);
    const schedules = await this.ledger.resolveSchedules(enrollments, month);

    const byMonth = new Map<string, FinanceMonth>(
      months.map((m) => [
        m,
        { month: m, received: 0, paidOut: 0, cashProfit: 0, charged: 0, salaryAccrued: 0, accrualProfit: 0 },
      ])
    );

    for (const payment of payments) {
      const entry = byMonth.get(monthKey(payment.paidAt));
      if (entry) entry.received += payment.amount;
    }
    for (const payout of payouts) {
      const entry = byMonth.get(monthKey(payout.paidAt));
      if (entry) entry.paidOut += payout.amount;
    }
    for (const schedule of schedules.values()) {
      for (const item of schedule) {
        const entry = byMonth.get(item.month);
        if (entry) entry.charged += item.charge.amount;
      }
    }
    for (const accrual of accruals) {
      const entry = byMonth.get(accrual.month);
      if (entry) entry.salaryAccrued += accrual.amount;
    }
    for (const entry of byMonth.values()) {
      entry.cashProfit = entry.received - entry.paidOut;
      entry.accrualProfit = entry.charged - entry.salaryAccrued;
    }

    // По каждому преподавателю за выбранный месяц: начислено и выдано.
    // Выдано — по дате выдачи денег, как касса; начислено — за сам месяц
    const teachers = new Map<string, { teacherId: string; teacherName: string; accrued: number; paidOut: number }>();
    const teacherRow = (teacherId: string) => {
      const row = teachers.get(teacherId) ?? { teacherId, teacherName: "", accrued: 0, paidOut: 0 };
      teachers.set(teacherId, row);
      return row;
    };
    for (const accrual of accruals) {
      if (accrual.month !== month) continue;
      const row = teacherRow(accrual.teacherId);
      row.accrued += accrual.amount;
      row.teacherName = accrual.teacherName;
    }
    for (const payout of payouts) {
      if (monthKey(payout.paidAt) !== month) continue;
      teacherRow(payout.teacherId).paidOut += payout.amount;
    }

    // Имена тех, у кого в месяце только выплата (группу уже не ведёт), —
    // мимо мягкого удаления: уволенный преподаватель не должен остаться без имени
    const unnamed = [...teachers.values()].filter((row) => !row.teacherName).map((row) => row.teacherId);
    if (unnamed.length > 0) {
      const users = await this.prismaService.prismaUnscoped.user.findMany({
        where: { id: { in: unnamed } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const user of users) teacherRow(user.id).teacherName = `${user.lastName} ${user.firstName}`;
    }

    const teacherRows = [...teachers.values()]
      .filter((row) => row.accrued !== 0 || row.paidOut !== 0)
      .sort((a, b) => b.paidOut - a.paidOut || b.accrued - a.accrued);

    return {
      month,
      current: byMonth.get(month)!,
      // Новые месяцы сверху — как в журналах оплат и выплат
      months: [...byMonth.values()].reverse(),
      teachers: teacherRows,
    };
  }
}
