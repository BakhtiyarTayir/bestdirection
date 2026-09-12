/**
 * Календарные даты без времени.
 *
 * В базе такие даты лежат ПОЛДНЕМ UTC. Это не украшательство: биллинг сравнивает
 * даты по UTC-компонентам (см. src/lib/billing.ts), а полночь по локали админа
 * в Ташкенте (UTC+5) сохранилась бы как 19:00 предыдущих суток — и начисления
 * уехали бы на день назад. Полдень даёт запас в 12 часов в обе стороны, поэтому
 * календарный день не меняется ни в одной реальной таймзоне.
 *
 * Через границу клиент↔сервер дата ходит строкой "YYYY-MM-DD": Date по дороге
 * сериализуется в момент времени, и локальные компоненты на сервере (он живёт
 * в UTC) прочитались бы уже как другие сутки.
 */

/** "YYYY-MM-DD" → полдень UTC этого дня */
export function toNoonUtc(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

/**
 * Дата из базы → "YYYY-MM-DD" для формы. Берём UTC-компоненты, потому что
 * храним полднем UTC: локальные дали бы тот же день, но только пока таймзона
 * не дальше 12 часов от Гринвича.
 */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * "YYYY-MM-DD" → Date для календаря. Собираем из ЛОКАЛЬНЫХ компонентов:
 * new Date("2026-10-01") дал бы полночь UTC, и западнее Гринвича календарь
 * подсветил бы 30 сентября.
 */
export function fromDateInput(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Значение формы → значение для prisma:
 * undefined — поле не менять, "" — очистить, дата — полдень UTC.
 */
export function dateInputToDb(
  value: string | undefined
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === "") return null;
  return toNoonUtc(value);
}
