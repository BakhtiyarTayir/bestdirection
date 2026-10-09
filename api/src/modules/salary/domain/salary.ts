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
import {
  addMonths,
  countLessons,
  currentMonthKey,
  isClosedMonth,
  isValidMonth,
  monthEnd,
  monthKey,
  monthStart,
  paymentMonth,
} from "../../billing/domain/billing";

export { addMonths, countLessons, currentMonthKey, isClosedMonth, isValidMonth, monthEnd, monthKey, monthStart };

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
  /**
   * Раскладка по проведённым занятиям (план «Уроки и карточка группы»,
   * этап 3). Не задано — раскладки в принципе нет (курс без группы: у курса
   * нет расписания, делить не на что) — формула считается по-старому,
   * base × percent. Задано — у группы есть расписание и за месяц есть хотя
   * бы одна запись в журнале; amountOverride уже посчитан снаружи
   * (splitAccrualByTeacher) как доля ИМЕННО ЭТОГО преподавателя от суммы,
   * которую формула отвела бы группе целиком.
   */
  lessons?: { planned: number; taught: number; amountOverride: number };
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
  /** Занятий по расписанию группы в месяце. null — раскладки не было (запасной путь или курс без группы) */
  lessonsPlanned: number | null;
  /** Сколько из них провёл этот преподаватель. Больше lessonsPlanned — были отработки */
  lessonsTaught: number | null;
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
  // Раскладка по занятиям (если применима) перебивает саму формулу суммы —
  // percentUsed остаётся прежним (это ставка ГРУППЫ, одна на всех, кто в ней
  // отметился), но сумма делится по занятиям, а не достаётся целиком
  const formulaAmount = input.lessons
    ? input.lessons.amountOverride
    : computeFormulaAmount(input.base, percentUsed);
  const lessonsPlanned = input.lessons?.planned ?? null;
  const lessonsTaught = input.lessons?.taught ?? null;

  if (input.manualAmount !== null) {
    return {
      base: input.base,
      studentsCount: input.studentsCount,
      percentUsed,
      amount: input.manualAmount,
      isFormula: false,
      lessonsPlanned,
      lessonsTaught,
    };
  }

  return {
    base: input.base,
    studentsCount: input.studentsCount,
    percentUsed,
    amount: formulaAmount,
    isFormula: percentUsed !== null,
    lessonsPlanned,
    lessonsTaught,
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
  lessonsPlanned: number | null;
  lessonsTaught: number | null;
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
    lessonsPlanned: stored.lessonsPlanned,
    lessonsTaught: stored.lessonsTaught,
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

// ─── Поступления по ученикам (справочно, зарплату не меняют) ───

/** Начисление ученика за месяц; у нуля тоже есть строка — состав единицы */
export interface StudentCharge {
  studentId: string;
  firstName: string;
  lastName: string;
  unenrolled: boolean;
  amount: number;
}

export interface StudentPaymentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  unenrolled: boolean;
  charged: number;
  paid: number;
  /** charged - paid; отрицательное — переплата за месяц */
  remaining: number;
}

/**
 * Сводит начисления и оплаты по ученикам за месяц. Оплата идёт в месяц по
 * paymentMonth (forMonth, иначе месяц paidAt) — то же правило, что в долгах.
 * Оплаты учеников вне списка начислений игнорируются (вызывающий уже
 * отобрал состав). В список попадают ученики с charged > 0 или paid > 0;
 * сначала с остатком (по убыванию), потом остальные по фамилии.
 */
export function studentPaymentRows(
  charges: StudentCharge[],
  payments: { studentId: string; amount: number; forMonth: string | null; paidAt: Date }[],
  month: string
): {
  students: StudentPaymentRow[];
  totals: { charged: number; paid: number; remaining: number };
} {
  const byStudent = new Map<string, StudentPaymentRow>();
  for (const charge of charges) {
    const row = byStudent.get(charge.studentId) ?? {
      studentId: charge.studentId,
      firstName: charge.firstName,
      lastName: charge.lastName,
      unenrolled: false,
      charged: 0,
      paid: 0,
      remaining: 0,
    };
    row.charged += charge.amount;
    row.unenrolled = row.unenrolled || charge.unenrolled;
    byStudent.set(charge.studentId, row);
  }
  for (const payment of payments) {
    if (paymentMonth(payment) !== month) continue;
    const row = byStudent.get(payment.studentId);
    if (row) row.paid += payment.amount;
  }

  const students = [...byStudent.values()]
    .filter((row) => row.charged > 0 || row.paid > 0)
    .map((row) => ({ ...row, remaining: row.charged - row.paid }))
    .sort(
      (a, b) =>
        Number(b.remaining > 0) - Number(a.remaining > 0) ||
        b.remaining - a.remaining ||
        a.lastName.localeCompare(b.lastName, "ru") ||
        a.firstName.localeCompare(b.firstName, "ru")
    );

  const charged = students.reduce((sum, row) => sum + row.charged, 0);
  const paid = students.reduce((sum, row) => sum + row.paid, 0);
  return { students, totals: { charged, paid, remaining: charged - paid } };
}

// ─── Зарплата по проведённым занятиям (план «Уроки и карточка группы», этап 3) ───

/** Занятие группы за месяц — для подсчёта отметок и раскладки по преподавателям */
export interface AttendanceSessionForSplit {
  date: Date;
  /** null — статус не проставлен. ABSENT занятие не засчитывается никому */
  teacherStatus: string | null;
  /** Ведущий по лестнице «записанный → педагог группы → педагог курса» (attendance-access.ts) */
  responsibleTeacherId: string | null;
}

/** Занятие, засчитанное кому-то из преподавателей, — для списка с датами в карточке (4.4) */
export interface CountedSession {
  date: Date;
  teacherId: string;
}

export interface MonthLessonMarks {
  /** Занятий по расписанию группы в месяце (countLessons) */
  lessonsPlanned: number;
  /**
   * Сколько записей в журнале вообще есть за месяц по этой группе —
   * независимо от статуса. Меньше lessonsPlanned — журнал неполный, и это
   * условие запасного пути (4.5).
   */
  sessionsMarked: number;
  /** Нет расписания ИЛИ в журнале отмечено меньше занятий, чем по расписанию, — раскладки нет (4.5) */
  fallback: boolean;
  /** Сколько занятий провёл каждый преподаватель (не ABSENT, ведущий известен) */
  taughtByTeacher: Map<string, number>;
  /** Те же занятия поштучно, с датами — материал для markMakeupSessions */
  countedSessions: CountedSession[];
}

/**
 * Отметки за месяц по группе: сколько занятий по расписанию, сколько вообще
 * отмечено в журнале и кто сколько провёл. Чистая функция — вызывающий уже
 * загрузил AttendanceSession за нужный диапазон дат (salary.service.ts).
 *
 * ABSENT занятие не засчитывается никому, но и знаменатель (lessonsPlanned)
 * не уменьшает: расписание от чужого отсутствия не меняется (план, 4.3).
 */
export function computeMonthLessonMarks(
  scheduleDays: number[],
  from: Date,
  to: Date,
  sessions: AttendanceSessionForSplit[]
): MonthLessonMarks {
  const lessonsPlanned = countLessons(scheduleDays, from, to);
  const sessionsMarked = sessions.length;
  // Нет расписания — считать не на чем; в журнале отмечено меньше занятий,
  // чем по расписанию, — считать не по чему. Оба случая — запасной путь (4.5).
  // Неполный журнал раньше делил сумму по тому, что успели отметить: две
  // отметки из двенадцати давали педагогу 2/12 месяца, хотя он, скорее
  // всего, провёл все двенадцать. Журнал ведут не всегда (решение владельца
  // 2026-09-23, вариант А): пока месяц отмечен не полностью, сумма целиком
  // идёт педагогу группы, а замены учитываются только в полных месяцах.
  const fallback = scheduleDays.length === 0 || sessionsMarked < lessonsPlanned;

  const taughtByTeacher = new Map<string, number>();
  const countedSessions: CountedSession[] = [];

  if (!fallback) {
    for (const session of sessions) {
      if (!session.responsibleTeacherId || session.teacherStatus === "ABSENT") continue;
      taughtByTeacher.set(
        session.responsibleTeacherId,
        (taughtByTeacher.get(session.responsibleTeacherId) ?? 0) + 1
      );
      countedSessions.push({ date: session.date, teacherId: session.responsibleTeacherId });
    }
  }

  return { lessonsPlanned, sessionsMarked, fallback, taughtByTeacher, countedSessions };
}

export interface TeacherLessonShare {
  teacherId: string;
  lessonsTaught: number;
  amount: number;
}

/**
 * Делит сумму, которую формула отвела группе целиком (`groupMonthAmount`),
 * между преподавателями пропорционально числу проведённых занятий.
 *
 * Округление (план, 4.7): когда провели ровно столько, сколько по расписанию
 * (сумма taught по всем преподавателям == lessonsPlanned), сумма долей
 * обязана в точности равняться groupMonthAmount — остаток от деления
 * раздаётся по наибольшей дробной части, тот же приём, что и везде в
 * проекте, где целая сумма делится на части. Когда провели МЕНЬШЕ или
 * БОЛЬШЕ (пропуск без отработки, отработка), доли по определению не обязаны
 * сходиться к groupMonthAmount — это честное отличие, не ошибка, и здесь
 * достаточно независимого округления каждой доли.
 */
export function splitAccrualByTeacher(
  groupMonthAmount: number,
  lessonsPlanned: number,
  taughtByTeacher: Map<string, number>
): TeacherLessonShare[] {
  const entries = [...taughtByTeacher.entries()].filter(([, taught]) => taught > 0);
  if (lessonsPlanned <= 0 || entries.length === 0) return [];

  const totalTaught = entries.reduce((sum, [, taught]) => sum + taught, 0);
  const shares = entries.map(([teacherId, taught]) => {
    const exact = (groupMonthAmount * taught) / lessonsPlanned;
    return { teacherId, lessonsTaught: taught, exact, floor: Math.floor(exact) };
  });

  if (totalTaught !== lessonsPlanned) {
    return shares.map((share) => ({
      teacherId: share.teacherId,
      lessonsTaught: share.lessonsTaught,
      amount: Math.round(share.exact),
    }));
  }

  const allocated = shares.reduce((sum, share) => sum + share.floor, 0);
  let remainder = groupMonthAmount - allocated;
  const byRemainder = [...shares].sort((a, b) => b.exact - b.floor - (a.exact - a.floor));
  const amounts = new Map(shares.map((share) => [share.teacherId, share.floor]));
  for (let i = 0; i < byRemainder.length && remainder > 0; i++, remainder--) {
    const teacherId = byRemainder[i].teacherId;
    amounts.set(teacherId, (amounts.get(teacherId) ?? 0) + 1);
  }

  return shares.map((share) => ({
    teacherId: share.teacherId,
    lessonsTaught: share.lessonsTaught,
    amount: amounts.get(share.teacherId) ?? share.floor,
  }));
}

export interface MarkedSession extends CountedSession {
  /** true — занятие вне плана месяца: отработка (план, 4.4) */
  isMakeup: boolean;
}

/**
 * Помечает отработки: занятия сверх lessonsPlanned, считая от самых ранних
 * дат месяца — то есть отработками оказываются самые ПОЗДНИЕ по дате
 * занятия, независимо от того, кто их провёл (отработка — понятие уровня
 * группы, план 4.4, а не конкретного преподавателя).
 */
export function markMakeupSessions(sessions: CountedSession[], lessonsPlanned: number): MarkedSession[] {
  return [...sessions]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((session, index) => ({ ...session, isMakeup: index >= lessonsPlanned }));
}
