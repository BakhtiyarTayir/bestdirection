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
  lessons?: {
    /** null — месяц в запасном пути (раскладки нет), но отработки всё равно есть */
    planned: number | null;
    taught: number | null;
    /** Отработки этого преподавателя (оплачены сверх суммы группы) */
    makeup: number;
    /** Доля + оплата отработок, уже посчитано снаружи (allocateMonth) */
    amountOverride: number;
  };
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
  /** Отработки (явная галочка), оплаченные сверх суммы группы. 0 — не было */
  lessonsMakeup: number;
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
  const lessonsMakeup = input.lessons?.makeup ?? 0;

  if (input.manualAmount !== null) {
    return {
      base: input.base,
      studentsCount: input.studentsCount,
      percentUsed,
      amount: input.manualAmount,
      isFormula: false,
      lessonsPlanned,
      lessonsTaught,
      lessonsMakeup,
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
    lessonsMakeup,
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
  /** У строк, замороженных до появления галочки «Отработка», NULL — читается как 0 */
  lessonsMakeup?: number | null;
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
    lessonsMakeup: stored.lessonsMakeup ?? 0,
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

// ─── Премии и штрафы ───

/** Минимум полей корректировки, нужных расчёту; deletedAt проверяется отдельно */
export interface AdjustmentLike {
  kind: "BONUS" | "PENALTY";
  amount: number;
  month: string;
}

/** Сумма в базе всегда положительная, знак задаёт kind: премия +amount, штраф −amount. */
export function adjustmentSigned(adjustment: Pick<AdjustmentLike, "kind" | "amount">): number {
  return adjustment.kind === "BONUS" ? adjustment.amount : -adjustment.amount;
}

/**
 * Сумма корректировок со знаком. upTo — месяцы ≤ upTo (для долга «по M
 * включительно»), only — ровно один месяц (колонка месяца в сводке).
 * Удалённые (deletedAt задан) не учитываются, даже если вызывающий забыл
 * отфильтровать их в запросе.
 */
export function sumAdjustments(
  list: (AdjustmentLike & { deletedAt?: Date | null })[],
  filter: { upTo?: string; only?: string } = {}
): number {
  let total = 0;
  for (const adjustment of list) {
    if (adjustment.deletedAt) continue;
    if (filter.upTo !== undefined && adjustment.month > filter.upTo) continue;
    if (filter.only !== undefined && adjustment.month !== filter.only) continue;
    total += adjustmentSigned(adjustment);
  }
  return total;
}

// ─── Раскладка долга: остаток прошлых месяцев / месяц M ───

export interface TeacherBalanceSplit {
  /** Начислено до M минус выплачено по месяцам до M. Отрицательное — переплата (аванс) */
  carriedOver: number;
  /** Начислено за сам M: группы + премии − штрафы */
  accrued: number;
  /** Выплаты, засчитанные в M (payoutMonth = M) */
  paidMonth: number;
  /** Выплаты по M включительно (накопительно) — прежнее поле API */
  paidTotal: number;
  /** Начислено по M включительно (накопительно) — прежнее поле API */
  accruedTotal: number;
  /** accruedTotal − paidTotal = carriedOver + accrued − paidMonth */
  debt: number;
}

/**
 * Раскладывает итоговый долг преподавателя на месяц M. Сам долг от раскладки
 * не зависит: это та же разность «начислено по M включительно − выплачено по
 * M включительно», просто с выделенным остатком прошлых месяцев. Месяцы и
 * выплаты позже M в расчёте не участвуют (как и раньше).
 */
export function splitTeacherBalance(
  input: {
    accruedByMonth: { month: string; amount: number }[];
    adjustments: (AdjustmentLike & { deletedAt?: Date | null })[];
    payouts: { amount: number; forMonth: string | null; paidAt: Date }[];
  },
  month: string
): TeacherBalanceSplit {
  let accruedBefore = 0;
  let accruedMonth = 0;
  for (const item of input.accruedByMonth) {
    if (item.month < month) accruedBefore += item.amount;
    else if (item.month === month) accruedMonth += item.amount;
  }
  let adjustmentsBefore = 0;
  for (const adjustment of input.adjustments) {
    if (adjustment.deletedAt || adjustment.month >= month) continue;
    adjustmentsBefore += adjustmentSigned(adjustment);
  }
  const adjustmentsMonth = sumAdjustments(input.adjustments, { only: month });

  let paidBefore = 0;
  let paidMonth = 0;
  for (const payout of input.payouts) {
    const key = payoutMonth(payout);
    if (key < month) paidBefore += payout.amount;
    else if (key === month) paidMonth += payout.amount;
  }

  const carriedOver = accruedBefore + adjustmentsBefore - paidBefore;
  const accrued = accruedMonth + adjustmentsMonth;
  return {
    carriedOver,
    accrued,
    paidMonth,
    paidTotal: paidBefore + paidMonth,
    accruedTotal: accruedBefore + adjustmentsBefore + accrued,
    debt: carriedOver + accrued - paidMonth,
  };
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
  /** Явная галочка «Отработка»: оплачивается сверх суммы группы и не входит в обычные */
  isMakeup: boolean;
}

/** Занятие, засчитанное кому-то из преподавателей, — для списка с датами в карточке (4.4) */
export interface CountedSession {
  date: Date;
  teacherId: string;
  /** Берётся из флага занятия, а не вычисляется по порядку дат */
  isMakeup: boolean;
}

export interface MonthLessonMarks {
  /** Занятий по расписанию группы в месяце (countLessons) */
  lessonsPlanned: number;
  /**
   * Сколько ОБЫЧНЫХ записей в журнале есть за месяц по этой группе —
   * независимо от статуса, но без отработок (isMakeup). Меньше lessonsPlanned
   * — журнал неполный, и это условие запасного пути (4.5). Отработка недобор
   * не закрывает: иначе галочка на одном занятии снимала бы fallback.
   */
  sessionsMarked: number;
  /** Нет расписания ИЛИ в журнале отмечено меньше обычных занятий, чем по расписанию, — раскладки нет (4.5) */
  fallback: boolean;
  /** Сколько обычных занятий провёл каждый преподаватель (не ABSENT, ведущий известен) */
  taughtByTeacher: Map<string, number>;
  /**
   * Сколько отработок провёл каждый преподаватель (не ABSENT, ведущий
   * известен). Считается и в запасном пути (отработка оплачивается сверх
   * суммы в любом месяце), но не при lessonsPlanned = 0: цены занятия нет.
   */
  makeupByTeacher: Map<string, number>;
  /** Занятия поштучно, с датами и флагом — материал для списка в карточке (4.4) */
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
  const regular = sessions.filter((session) => !session.isMakeup);
  const sessionsMarked = regular.length;
  // Нет расписания — считать не на чем; в журнале отмечено меньше занятий,
  // чем по расписанию, — считать не по чему. Оба случая — запасной путь (4.5).
  // Неполный журнал раньше делил сумму по тому, что успели отметить: две
  // отметки из двенадцати давали педагогу 2/12 месяца, хотя он, скорее
  // всего, провёл все двенадцать. Журнал ведут не всегда (решение владельца
  // 2026-09-23, вариант А): пока месяц отмечен не полностью, сумма целиком
  // идёт педагогу группы, а замены учитываются только в полных месяцах.
  const fallback = scheduleDays.length === 0 || sessionsMarked < lessonsPlanned;

  const taughtByTeacher = new Map<string, number>();
  const makeupByTeacher = new Map<string, number>();
  const countedSessions: CountedSession[] = [];

  for (const session of sessions) {
    if (!session.responsibleTeacherId || session.teacherStatus === "ABSENT") continue;
    const teacherId = session.responsibleTeacherId;
    if (session.isMakeup) {
      // Нет расписания (lessonsPlanned = 0) — нет и цены занятия
      if (lessonsPlanned <= 0) continue;
      makeupByTeacher.set(teacherId, (makeupByTeacher.get(teacherId) ?? 0) + 1);
      countedSessions.push({ date: session.date, teacherId, isMakeup: true });
    } else if (!fallback) {
      taughtByTeacher.set(teacherId, (taughtByTeacher.get(teacherId) ?? 0) + 1);
      countedSessions.push({ date: session.date, teacherId, isMakeup: false });
    }
  }

  return { lessonsPlanned, sessionsMarked, fallback, taughtByTeacher, makeupByTeacher, countedSessions };
}

/**
 * Занятий сверх расписания: обычных (не отработка, не ABSENT — тех же, что
 * идут в оплату) больше, чем по плану месяца. Одна функция на всё:
 * предупреждение при создании занятия, пункт «Требует внимания» на главной
 * админа (а при желании — и предупреждение учителю). Группа без расписания
 * (planned = 0) сверх плана не бывает: сравнивать не с чем.
 */
export function regularLessonsOverPlan(
  lessonsPlanned: number,
  sessions: { isMakeup: boolean; teacherStatus: string | null }[]
): { regular: number; over: boolean } {
  const regular = sessions.filter((s) => !s.isMakeup && s.teacherStatus !== "ABSENT").length;
  return { regular, over: lessonsPlanned > 0 && regular > lessonsPlanned };
}

export interface TeacherLessonShare {
  teacherId: string;
  lessonsTaught: number;
  amount: number;
}

/**
 * Делит сумму, которую формула отвела группе целиком (`groupMonthAmount`),
 * между преподавателями пропорционально числу проведённых обычных занятий.
 *
 * Знаменатель — max(lessonsPlanned, сумма taught): обычные занятия СВЕРХ
 * расписания денег не добавляют (решение владельца 2026-11-08), настоящая
 * отработка оплачивается отдельно по галочке (makeupAmount). Когда
 * проведено не меньше плана, сумма долей в точности равна groupMonthAmount —
 * остаток от деления раздаётся по наибольшей дробной части, тот же приём,
 * что и везде в проекте, где целая сумма делится на части. Когда провели
 * МЕНЬШЕ плана (часть занятий ABSENT), доли честно не сходятся к
 * groupMonthAmount — достаточно независимого округления каждой.
 */
export function splitAccrualByTeacher(
  groupMonthAmount: number,
  lessonsPlanned: number,
  taughtByTeacher: Map<string, number>
): TeacherLessonShare[] {
  const entries = [...taughtByTeacher.entries()].filter(([, taught]) => taught > 0);
  if (lessonsPlanned <= 0 || entries.length === 0) return [];

  const totalTaught = entries.reduce((sum, [, taught]) => sum + taught, 0);
  const denominator = Math.max(lessonsPlanned, totalTaught);
  const shares = entries.map(([teacherId, taught]) => {
    const exact = (groupMonthAmount * taught) / denominator;
    return { teacherId, lessonsTaught: taught, exact, floor: Math.floor(exact) };
  });

  if (totalTaught < lessonsPlanned) {
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

/**
 * Оплата отработок: округляется цена ОДНОГО занятия (сумма группы целиком /
 * занятий по плану), потом умножается на число отработок. Цена считается от
 * полной суммы группы, а не от доли преподавателя. Округление — Math.round,
 * как в billing.ts (chargeForMonth). 1 200 000 / 14 = 85 714 → две отработки
 * дают 171 428.
 */
export function makeupAmountFor(groupMonthAmount: number, lessonsPlanned: number, count: number): number {
  if (lessonsPlanned <= 0 || count <= 0) return 0;
  return Math.round(groupMonthAmount / lessonsPlanned) * count;
}

/** Итог месяца одного преподавателя в группе: обычная доля + отработки */
export interface TeacherMonthAllocation {
  teacherId: string;
  /** null — запасной путь, раскладки по обычным занятиям нет */
  lessonsTaught: number | null;
  lessonsMakeup: number;
  /** Доля от суммы группы (без отработок) */
  shareAmount: number;
  makeupAmount: number;
  /** shareAmount + makeupAmount — то, что пишется в строку начисления */
  amount: number;
}

/**
 * Единое место, где сумма группы за месяц превращается в суммы
 * преподавателей. Живой расчёт, заморозка и пересчёт закрытого месяца
 * вызывают ТОЛЬКО её — иначе открытый месяц и тот же месяц после закрытия
 * разошлись бы в деньгах.
 *
 *  - marks нет (курс без группы) или запасной путь: вся сумма владельцу;
 *  - раскладка: доли по обычным занятиям, владелец без занятий получает
 *    строку с нулём (видно, что месяц его и что он пропущен);
 *  - отработки платятся тому, кто их провёл, сверх суммы — и в запасном пути
 *    тоже; преподаватель с одной отработкой получает свою строку.
 *
 * lessonsPlanned в ответе null, когда раскладки нет (как в TeacherSalaryAccrual).
 */
export function allocateMonth(
  groupMonthAmount: number,
  marks: MonthLessonMarks | undefined,
  ownerTeacherId: string
): { lessonsPlanned: number | null; rows: TeacherMonthAllocation[] } {
  const split = marks && !marks.fallback ? marks : null;
  const rows = new Map<string, TeacherMonthAllocation>();
  const ensure = (teacherId: string): TeacherMonthAllocation => {
    let row = rows.get(teacherId);
    if (!row) {
      row = { teacherId, lessonsTaught: split ? 0 : null, lessonsMakeup: 0, shareAmount: 0, makeupAmount: 0, amount: 0 };
      rows.set(teacherId, row);
    }
    return row;
  };

  if (split) {
    for (const share of splitAccrualByTeacher(groupMonthAmount, split.lessonsPlanned, split.taughtByTeacher)) {
      const row = ensure(share.teacherId);
      row.lessonsTaught = share.lessonsTaught;
      row.shareAmount = share.amount;
    }
  } else {
    ensure(ownerTeacherId).shareAmount = groupMonthAmount;
  }
  ensure(ownerTeacherId);

  if (marks) {
    for (const [teacherId, count] of marks.makeupByTeacher) {
      const row = ensure(teacherId);
      row.lessonsMakeup = count;
      row.makeupAmount = makeupAmountFor(groupMonthAmount, marks.lessonsPlanned, count);
    }
  }
  for (const row of rows.values()) row.amount = row.shareAmount + row.makeupAmount;

  return { lessonsPlanned: split ? split.lessonsPlanned : null, rows: [...rows.values()] };
}
