/**
 * Форматирует дату в формат ДД.ММ.ГГГГ
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Форматирует дату и время в формат ДД.ММ.ГГГГ, ЧЧ:ММ
 */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Форматирует дату с полным названием месяца: 14 марта 2026
 */
export function formatFullDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
