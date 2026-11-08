import { intlLocale } from "@/i18n/config";

/**
 * Числовая дата DD.MM.YYYY. Формат намеренно не зависит от локали: он одинаков
 * в русском и узбекском интерфейсе, а у ICU для uz-UZ короткая дата идёт через
 * слэши (14/03/2026) — в таблицах кабинета это выглядело бы чужеродно.
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Дата и время DD.MM.YYYY, HH:MM — так же вне локали, см. formatDate. */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return `${formatDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Дата с названием месяца: «14 mart 2026» / «14 марта 2026». Здесь локаль важна,
 * поэтому вызывающий передаёт текущую — без неё берётся язык по умолчанию.
 */
export function formatFullDate(date: Date | string, locale?: string): string {
  const d = new Date(date);
  return d.toLocaleDateString(intlLocale(locale ?? ""), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Название месяца по ключу "YYYY-MM" («сентябрь» / «sentabr»), без года. */
export function formatMonthName(month: string, locale?: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1, 12)).toLocaleDateString(intlLocale(locale ?? ""), {
    month: "long",
    timeZone: "UTC",
  });
}

/** Компактные дата и время без года: DD.MM, HH:MM. Вне локали, см. formatDate. */
export function formatShortDateTime(date: Date | string): string {
  const d = new Date(date);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Дата без года: DD.MM — список пропусков на странице успеваемости, где год не нужен. */
export function formatDayMonth(date: Date | string): string {
  const d = new Date(date);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
