import { dateKeyOf, toUtcMidnight } from "../../dashboard/teacher-dashboard.service";
import { isoWeekday, SCHOOL_UTC_OFFSET_HOURS } from "../../billing/domain/billing";

const DAY_MS = 86_400_000;
const OFFSET_MS = SCHOOL_UTC_OFFSET_HOURS * 3_600_000;

/**
 * Границы «прошедшей недели» (пн–вс по Ташкенту) для еженедельной сводки.
 * Сводка шлётся по понедельникам в 09:00 по Ташкенту — к этому моменту
 * прошедшая неделя уже полностью закрыта, поэтому от «сегодня» просто
 * отступаем на календарную неделю назад. Если задание запустить не в
 * понедельник (ручной прогон, тест) — отступаем от ближайшего прошлого
 * понедельника, а не падаем.
 */
export interface WeekBounds {
  /** Понедельник недели — используется и как ключ WeeklyDigestRun.weekKey */
  weekKey: string;
  /** Начало недели, UTC-момент: для полей DateTime (reviewedAt, completedAt) */
  fromInstant: Date;
  /** Конец недели, ИСКЛЮЧАЯ (следующий понедельник 00:00 Ташкент), UTC-момент */
  toInstantExclusive: Date;
  /** Понедельник недели, календарная дата — для полей @db.Date (AttendanceSession.date) */
  fromDateKey: string;
  /** Воскресенье недели, календарная дата (включительно) */
  toDateKey: string;
}

export function previousWeek(now: Date = new Date()): WeekBounds {
  // "Часы Ташкента": сдвигаем now на +5, дальше работаем с UTC-компонентами
  // сдвинутой даты как с местным временем — тот же приём, что currentDateKey.
  const shiftedNow = new Date(now.getTime() + OFFSET_MS);
  const shiftedToday = new Date(
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate())
  );

  const weekday = isoWeekday(shiftedToday); // 1 = понедельник
  const shiftedThisMonday = new Date(shiftedToday.getTime() - (weekday - 1) * DAY_MS);
  const shiftedLastMonday = new Date(shiftedThisMonday.getTime() - 7 * DAY_MS);

  // Назад в реальный UTC-момент: вычитаем тот же сдвиг
  const fromInstant = new Date(shiftedLastMonday.getTime() - OFFSET_MS);
  const toInstantExclusive = new Date(shiftedThisMonday.getTime() - OFFSET_MS);

  const fromDateKey = dateKeyOf(shiftedLastMonday);
  const toDateKey = dateKeyOf(new Date(shiftedThisMonday.getTime() - DAY_MS));

  return {
    weekKey: fromDateKey,
    fromInstant,
    toInstantExclusive,
    fromDateKey,
    toDateKey,
  };
}

/**
 * Текущая неделя по Ташкенту — с понедельника по сегодня включительно. Для
 * команды /progress в боте: родитель спрашивает «как дела сейчас», а не за
 * прошлую неделю, как в понедельничной сводке.
 */
export function currentWeek(now: Date = new Date()): WeekBounds {
  const shiftedNow = new Date(now.getTime() + OFFSET_MS);
  const shiftedToday = new Date(
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate())
  );
  const shiftedThisMonday = new Date(shiftedToday.getTime() - (isoWeekday(shiftedToday) - 1) * DAY_MS);
  const fromDateKey = dateKeyOf(shiftedThisMonday);

  return {
    weekKey: fromDateKey,
    fromInstant: new Date(shiftedThisMonday.getTime() - OFFSET_MS),
    toInstantExclusive: new Date(shiftedToday.getTime() + DAY_MS - OFFSET_MS),
    fromDateKey,
    toDateKey: dateKeyOf(shiftedToday),
  };
}

/** Границы недели как Date для запроса по @db.Date полю (включительно с обеих сторон). */
export function weekDateRange(bounds: WeekBounds): { gte: Date; lte: Date } {
  return { gte: toUtcMidnight(bounds.fromDateKey), lte: toUtcMidnight(bounds.toDateKey) };
}
