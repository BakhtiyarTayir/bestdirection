/** За сколько дней до конца оплаты хостинга показывать плашку на главной. */
export const HOSTING_WARN_DAYS = 10;

const DAY_MS = 86_400_000;

/**
 * Сколько дней осталось до конца оплаченного срока: обе даты — "YYYY-MM-DD"
 * по Ташкенту. 0 — срок истекает сегодня, минус — уже истёк.
 */
export function hostingDaysLeft(paidUntil: string, today: string): number {
  return Math.round((Date.parse(`${paidUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}
