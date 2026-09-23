// Расчёт начислений. Перенесено из src/lib/billing.ts в web без изменений:
// файл чистый, без зависимостей, и проверен теми же тестами (billing.spec.ts).
//
/**
 * Расчёт начислений за обучение.
 *
 * Модель: календарный месяц. Полный месяц стоит `price`, неполный (первый или
 * последний) начисляется пропорционально ЗАНЯТИЯМ, а не дням — из-за этого день
 * прихода учитывается ровно тогда, когда в этот день есть урок, а студент,
 * пришедший после последнего занятия месяца, за этот месяц не платит вовсе
 * (числитель = 0). Отдельных правил для «пришёл 28-го» не нужно.
 *
 * Все даты трактуются как календарные в UTC: даты биллинга сохраняются полднем
 * UTC (см. toNoonUtc в payment-actions), поэтому сравнение по UTC-компонентам
 * не съезжает на сутки в таймзонах впереди Гринвича.
 */

export type ChargeBasis =
  | "full" // полный месяц по цене
  | "lessons" // неполный месяц, пропорция по занятиям
  | "days" // неполный месяц, у группы нет расписания — пропорция по дням
  | "manual" // сумма зафиксирована админом (Enrollment.firstMonthCharge)
  | "none"; // вне периода обучения или курс без цены

export interface ChargeResult {
  amount: number;
  basis: ChargeBasis;
  /** Занятий (или дней для basis="days") в месяце всего */
  unitsTotal: number;
  /** Из них оплачиваемых */
  unitsBilled: number;
}

export interface BillingEnrollment {
  /** Первый учебный день; если не задан — дата создания записи */
  startsAt: Date | null;
  createdAt: Date;
  /** Последний оплачиваемый день (уход/пауза) */
  billingEndsAt: Date | null;
  /** Индивидуальная цена за месяц вместо цены курса */
  priceOverride: number | null;
  /** Зафиксированное админом начисление за первый неполный месяц */
  firstMonthCharge: number | null;
  /**
   * Цена группы за месяц. Цена курса в начислениях не участвует (решение
   * владельца 2026-09-23): она для витрины — каталог, заявки, лендинг.
   * Ученик без группы и без своей цены не начисляется вовсе.
   */
  groupPrice: number | null;
  /** Дни занятий по ISO (1 = пн … 7 = вс); пустой массив — расписания нет */
  scheduleDays: number[];
  /** Дата окончания группы — тоже прекращает начисления */
  groupEndDate: Date | null;
  /**
   * Дата начала группы — симметрично endDate откладывает начисления.
   * Студента могли завести в систему заранее, до старта группы; платить он
   * должен с того дня, когда группа начала заниматься.
   */
  groupStartDate: Date | null;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

/** Календарный месяц даты в виде "YYYY-MM" (по UTC) */
export function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// Школа в Ташкенте, UTC+5. Смещение фиксированное, а не через Intl/tz base —
// в Узбекистане нет перехода на летнее время, часовой пояс с 2024 года не
// менялся, и городить обращение к таймзоне ради одной константы незачем.
export const SCHOOL_UTC_OFFSET_HOURS = 5;

/**
 * Какой сейчас месяц по местному времени школы, а не по UTC. С полуночи до
 * 05:00 по Ташкенту 1-го числа UTC ещё показывает прошлый месяц — если считать
 * monthKey(new Date()) напрямую, «текущим» месяцем это окно ошибочно называет
 * предыдущий. Только для определения «какой сейчас месяц» — хранение дат
 * биллинга (полдень UTC) эта функция не трогает.
 */
export function currentMonthKey(now: Date = new Date()): string {
  return monthKey(new Date(now.getTime() + SCHOOL_UTC_OFFSET_HOURS * 3_600_000));
}

/**
 * Сегодняшняя календарная дата по местному времени школы, "YYYY-MM-DD".
 * Тот же сдвиг, что у currentMonthKey — нужна дашборду («Сегодня», «Требует
 * внимания») и не должна расходиться с тем, как определяется текущий месяц.
 */
export function currentDateKey(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + SCHOOL_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/** Первый день месяца, полдень UTC */
export function monthStart(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12));
}

/** Последний день месяца, полдень UTC */
export function monthEnd(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0, 12));
}

/** Сдвиг месяца: addMonths("2026-07", 1) === "2026-08" */
export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return monthKey(shifted);
}

/** Все месяцы включительно от from до to; пустой массив, если from позже to */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let current = from;
  // Ограничитель на случай мусора во входных данных — 10 лет истории хватит
  for (let i = 0; current <= to && i < 120; i++) {
    months.push(current);
    current = addMonths(current, 1);
  }
  return months;
}

/** День недели по ISO: 1 = понедельник … 7 = воскресенье */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Календарных дней в отрезке [from, to] включительно */
export function countDays(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Занятий в отрезке [from, to] включительно по дням недели группы */
export function countLessons(scheduleDays: number[], from: Date, to: Date): number {
  if (scheduleDays.length === 0) return 0;
  const days = new Set(scheduleDays);
  const total = countDays(from, to);
  let count = 0;
  for (let i = 0; i < total; i++) {
    const day = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i, 12)
    );
    if (days.has(isoWeekday(day))) count++;
  }
  return count;
}

const laterOf = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);
const earlierOf = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);

/**
 * Начало начислений: более поздняя из даты записи и даты старта группы.
 * Позже группы — значит студент пришёл не с первого дня и платит со своего
 * дня. Раньше группы — платить не с чего, занятий ещё не было.
 */
export function billingStart(enrollment: BillingEnrollment): Date {
  const own = enrollment.startsAt ?? enrollment.createdAt;
  if (!enrollment.groupStartDate) return own;
  return own.getTime() >= enrollment.groupStartDate.getTime()
    ? own
    : enrollment.groupStartDate;
}

const NOTHING: ChargeResult = {
  amount: 0,
  basis: "none",
  unitsTotal: 0,
  unitsBilled: 0,
};

/**
 * Цена за месяц по этой записи: цена студента → цена группы. Группа — это
 * «цена потока» (начальная дешевле, продвинутая дороже), а скидка конкретному
 * студенту должна её перебивать. Цены курса здесь нет намеренно: она для
 * витрины, и две цены одного потока (курса и группы) расходились бы.
 *
 * Отдельной функцией, потому что её спрашивает не только расчёт: реестр
 * начислений сохраняет цену, по которой посчитал, и брать её надо отсюда же,
 * иначе правило раздвоится.
 */
export function priceFor(enrollment: BillingEnrollment): number | null {
  return enrollment.priceOverride ?? enrollment.groupPrice;
}

/** Начисление за календарный месяц по одной записи на курс */
export function chargeForMonth(
  enrollment: BillingEnrollment,
  month: string
): ChargeResult {
  if (!isValidMonth(month)) return NOTHING;

  const price = priceFor(enrollment);
  if (price === null || price <= 0) return NOTHING;

  const start = billingStart(enrollment);
  // Из двух возможных дат окончания берём более раннюю: и уход студента,
  // и конец группы одинаково прекращают начисления
  const ends = [enrollment.billingEndsAt, enrollment.groupEndDate].filter(
    (date): date is Date => date !== null
  );
  const end = ends.length > 0 ? ends.reduce(earlierOf) : null;

  const from = monthStart(month);
  const to = monthEnd(month);

  // Ещё не начал или уже закончил
  if (monthKey(start) > month) return NOTHING;
  if (end && monthKey(end) < month) return NOTHING;

  const startsBefore = start.getTime() <= from.getTime();
  const endsAfter = !end || end.getTime() >= to.getTime();
  if (startsBefore && endsAfter) {
    return { amount: price, basis: "full", unitsTotal: 1, unitsBilled: 1 };
  }

  // Сумму за первый неполный месяц админ фиксирует руками — она важнее формулы
  if (enrollment.firstMonthCharge !== null && month === monthKey(start)) {
    return {
      amount: enrollment.firstMonthCharge,
      basis: "manual",
      unitsTotal: 0,
      unitsBilled: 0,
    };
  }

  const effectiveFrom = laterOf(start, from);
  const effectiveTo = end ? earlierOf(end, to) : to;

  const hasSchedule = enrollment.scheduleDays.length > 0;
  const unitsTotal = hasSchedule
    ? countLessons(enrollment.scheduleDays, from, to)
    : countDays(from, to);
  const unitsBilled = hasSchedule
    ? countLessons(enrollment.scheduleDays, effectiveFrom, effectiveTo)
    : countDays(effectiveFrom, effectiveTo);

  if (unitsTotal === 0 || unitsBilled === 0) {
    return { amount: 0, basis: hasSchedule ? "lessons" : "days", unitsTotal, unitsBilled };
  }

  return {
    // До целого сума: Payment.amount целочисленный, дробный остаток
    // иначе навсегда оставил бы студента должником на копейки
    amount: Math.round((price * unitsBilled) / unitsTotal),
    basis: hasSchedule ? "lessons" : "days",
    unitsTotal,
    unitsBilled,
  };
}

export interface MonthCharge {
  month: string;
  charge: ChargeResult;
}

/**
 * Начисления по месяцам от начала обучения до конца указанного месяца
 * включительно. Месяцы с нулевым начислением тоже возвращаются — они нужны,
 * чтобы показать в разбивке, что месяц не пропущен, а действительно бесплатный.
 */
export function chargeSchedule(
  enrollment: BillingEnrollment,
  upToMonth: string
): MonthCharge[] {
  if (!isValidMonth(upToMonth)) return [];
  const firstMonth = monthKey(billingStart(enrollment));
  if (firstMonth > upToMonth) return [];

  return monthRange(firstMonth, upToMonth).map((month) => ({
    month,
    charge: chargeForMonth(enrollment, month),
  }));
}

/** Уже зафиксированное начисление за месяц (строка MonthlyCharge) */
export interface StoredCharge {
  month: string;
  amount: number;
  basis: ChargeBasis;
  unitsTotal: number;
  unitsBilled: number;
}

/**
 * Месяц закрыт, если он уже прошёл. Текущий и будущие закрывать нельзя:
 * в них начисление ещё может измениться законно — студент уйдёт в паузу,
 * админ поправит дату начала.
 */
export function isClosedMonth(month: string, now: Date = new Date()): boolean {
  return month < currentMonthKey(now);
}

/**
 * Накладывает зафиксированные начисления на вычисленные.
 *
 * Закрытый месяц, у которого есть сохранённая строка, берётся из неё и
 * пересчёту не подлежит — именно это защищает оплаченный сентябрь от того,
 * чтобы его переписала цена, изменённая в октябре. Открытый месяц всегда
 * считается формулой, даже если строка почему-то есть.
 *
 * Зафиксированные месяцы, которых больше нет в расчёте, возвращаются тоже:
 * если админ сдвинул дату начала вперёд, деньги за уже закрытый месяц никуда
 * не делись, и молча забыть про них нельзя.
 */
export function mergeSchedule(
  computed: MonthCharge[],
  stored: StoredCharge[],
  now: Date = new Date()
): MonthCharge[] {
  const toMonthCharge = (s: StoredCharge): MonthCharge => ({
    month: s.month,
    charge: {
      amount: s.amount,
      basis: s.basis,
      unitsTotal: s.unitsTotal,
      unitsBilled: s.unitsBilled,
    },
  });

  const byMonth = new Map(stored.map((s) => [s.month, s]));
  const result = computed.map((item) => {
    const frozen = byMonth.get(item.month);
    return frozen && isClosedMonth(item.month, now) ? toMonthCharge(frozen) : item;
  });

  const computedMonths = new Set(computed.map((item) => item.month));
  for (const s of stored) {
    if (!computedMonths.has(s.month) && isClosedMonth(s.month, now)) {
      result.push(toMonthCharge(s));
    }
  }

  return result.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** Сумма начислений с начала обучения по указанный месяц включительно */
export function totalCharged(
  enrollment: BillingEnrollment,
  upToMonth: string
): number {
  return chargeSchedule(enrollment, upToMonth).reduce(
    (sum, item) => sum + item.charge.amount,
    0
  );
}

/**
 * Месяц, за который засчитывается платёж. Если период не указан явно —
 * относим к месяцу приёма денег, иначе оплата потерялась бы в расчёте долга.
 */
export function paymentMonth(payment: {
  forMonth: string | null;
  paidAt: Date;
}): string {
  return payment.forMonth ?? monthKey(payment.paidAt);
}
