/**
 * Расчёт зарплаты преподавателя. Чистые функции без обращений к базе —
 * тот же приём, что в domain/billing.ts: вызывающий уже загрузил нужные поля,
 * а правило проверяется тестом (salary.spec.ts), а не e2e.
 *
 * Формула (план зарплат, раздел 5.1):
 *   база      = сумма начислений учеников группы за месяц (MonthlyCharge)
 *   процент   = процент группы ?? процент преподавателя ?? ставки нет
 *   начислено = округлённое(база × процент)
 *
 * «Закрытый месяц» — то же понятие, что в начислениях учеников: закон один на
 * весь биллинг (закрытый месяц не пересчитывается, открытый — всегда по
 * формуле), поэтому isClosedMonth и isValidMonth переиспользуются из
 * domain/billing.ts, а не заводится второй источник правды с тем же кодом.
 */
import { addMonths, isClosedMonth, isValidMonth, monthKey } from "../../billing/domain/billing";

export { addMonths, isClosedMonth, isValidMonth, monthKey };

// 1 базисный пункт = 0.01 %; 4000 = 40 %. См. User.salaryPercentBp в схеме.
const BP_SCALE = 10_000;

/** Процент группы важнее процента преподавателя — симметрично priceFor в биллинге. */
export function resolveSalaryPercentBp(input: {
  groupPercentBp: number | null;
  teacherPercentBp: number | null;
}): number | null {
  return input.groupPercentBp ?? input.teacherPercentBp ?? null;
}

/**
 * Сумма по формуле: округлённое(база × процент / 10000).
 * Ставки нет (percentBp === null) — 0, но это НЕ значит «месяц пустой»:
 * различие несёт percentUsed рядом, а не сама сумма (раздел 5.2 плана).
 */
export function computeFormulaAmount(base: number, percentBp: number | null): number {
  if (percentBp === null) return 0;
  // До целого сума: TeacherPayout.amount целочисленный, как Payment.amount
  return Math.round((base * percentBp) / BP_SCALE);
}

export interface AccrualComputationInput {
  base: number;
  studentsCount: number;
  groupPercentBp: number | null;
  teacherPercentBp: number | null;
  /** Сумма, зафиксированная админом вместо формулы — важнее её результата */
  manualAmount: number | null;
}

export interface AccrualComputationResult {
  base: number;
  studentsCount: number;
  /** null — ставки нет ни у группы, ни у преподавателя: «ставка не задана», а не 0% */
  percentUsed: number | null;
  /** manualAmount, если задан, иначе результат формулы */
  amount: number;
  /** true — amount получен по формуле (ставка есть и manualAmount не задан) */
  isFormula: boolean;
}

/**
 * Начисление за один месяц по одной паре «преподаватель + группа» (или
 * «преподаватель + курс» для записей без группы).
 *
 * manualAmount важнее формулы целиком: администратор зафиксировал сумму
 * руками (болезнь, отпуск, разовая договорённость) — она замещает результат
 * формулы, даже когда ставка есть, точно как Enrollment.firstMonthCharge
 * замещает формулу начислений ученику.
 */
export function computeAccrual(input: AccrualComputationInput): AccrualComputationResult {
  const percentUsed = resolveSalaryPercentBp(input);
  const formulaAmount = computeFormulaAmount(input.base, percentUsed);

  if (input.manualAmount !== null) {
    return {
      base: input.base,
      studentsCount: input.studentsCount,
      percentUsed,
      amount: input.manualAmount,
      isFormula: false,
    };
  }

  return {
    base: input.base,
    studentsCount: input.studentsCount,
    percentUsed,
    amount: formulaAmount,
    isFormula: percentUsed !== null,
  };
}

/** Уже зафиксированное начисление за месяц (строка TeacherSalaryAccrual) */
export interface StoredAccrual {
  month: string;
  base: number;
  studentsCount: number;
  percentUsed: number | null;
  amount: number;
  manualAmount: number | null;
}

export interface MonthAccrual {
  month: string;
  accrual: AccrualComputationResult;
  /** true — месяц закрыт и зафиксирован, пересчёту формулой не подлежит */
  locked: boolean;
}

function fromStored(stored: StoredAccrual): AccrualComputationResult {
  return {
    base: stored.base,
    studentsCount: stored.studentsCount,
    percentUsed: stored.percentUsed,
    // Эффективная сумма: ручная правка перебивает то, что было заморожено —
    // manualAmount можно проставить и ПОСЛЕ заморозки (раздел 5.5,
    // PATCH /salary/accruals/:id), отдельно от явного пересчёта формулой.
    amount: stored.manualAmount ?? stored.amount,
    isFormula: stored.manualAmount === null && stored.percentUsed !== null,
  };
}

/**
 * Накладывает зафиксированные начисления (TeacherSalaryAccrual) на вычисленные
 * по текущим данным. Правило то же, что mergeSchedule в биллинге:
 *
 * закрытый месяц, у которого есть сохранённая строка, берётся из неё и
 * пересчёту НЕ подлежит — это и есть защита от того, чтобы смена процента
 * группы в ноябре задним числом переписала зарплату за закрытый октябрь.
 * Открытый месяц всегда считается формулой по текущим данным, даже если
 * строка почему-то уже есть.
 *
 * Зафиксированные месяцы, которых больше нет среди вычисленных (например,
 * студентов из группы разом убрали и текущий расчёт за тот месяц уже не
 * поднимается), возвращаются тоже — деньги за закрытый месяц никуда не делись.
 */
export function mergeAccrualMonths(
  computed: { month: string; input: AccrualComputationInput }[],
  stored: StoredAccrual[],
  now: Date = new Date()
): MonthAccrual[] {
  const byMonth = new Map(stored.map((s) => [s.month, s]));
  const computedMonths = new Set(computed.map((c) => c.month));

  const result: MonthAccrual[] = computed.map(({ month, input }) => {
    const frozen = byMonth.get(month);
    if (frozen && isClosedMonth(month, now)) {
      return { month, accrual: fromStored(frozen), locked: true };
    }
    return { month, accrual: computeAccrual(input), locked: false };
  });

  for (const stored_ of stored) {
    if (!computedMonths.has(stored_.month) && isClosedMonth(stored_.month, now)) {
      result.push({ month: stored_.month, accrual: fromStored(stored_), locked: true });
    }
  }

  return result.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** Сумма начисленного (с учётом ручных правок) по списку месяцев */
export function totalAccrued(months: MonthAccrual[]): number {
  return months.reduce((sum, item) => sum + item.accrual.amount, 0);
}

/**
 * Месяц, за который засчитывается выплата — то же правило, что paymentMonth
 * в биллинге: период не указан явно, считаем по дате выдачи денег.
 */
export function payoutMonth(payout: { forMonth: string | null; paidAt: Date }): string {
  return payout.forMonth ?? monthKey(payout.paidAt);
}
