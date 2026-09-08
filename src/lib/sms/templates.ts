/**
 * Подстановка переменных в текст шаблона.
 *
 * Синтаксис наш собственный — {student}, {group} и так далее. Eskiz
 * согласовывает текст целиком, поэтому шаблон на платформе и шаблон у
 * оператора должны совпадать по неизменяемой части: подставляются только
 * значения, структура фразы не меняется.
 */

export const TEMPLATE_VARIABLES = [
  "student", // имя ученика
  "parent", // имя родителя
  "group", // название группы
  "course", // название курса
  "amount", // сумма к оплате
  "month", // месяц начисления
  "center", // название центра
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateValues = Partial<Record<TemplateVariable, string | number>>;

/**
 * Заменяет {переменные} значениями. Незаполненные оставляет как есть —
 * так администратор увидит проблему в предпросмотре, а не отправит
 * родителям сообщение с пустотой посередине.
 */
export function renderTemplate(text: string, values: TemplateValues): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key as TemplateVariable];
    return value === undefined || value === null || value === "" ? match : String(value);
  });
}

/** Переменные, оставшиеся незаполненными: блокируют отправку. */
export function findUnresolved(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

/** Статус шаблона Eskiz → наш enum. */
export function mapTemplateStatus(
  eskizStatus: string
): "DRAFT" | "MODERATION" | "APPROVED" | "REJECTED" {
  const s = eskizStatus.toLowerCase();
  if (s.includes("moderat")) return "MODERATION";
  if (s.includes("reject") || s.includes("otkaz")) return "REJECTED";
  // Eskiz помечает согласованные по-разному в зависимости от версии кабинета,
  // поэтому всё, что не модерация и не отказ, считаем одобренным.
  if (s.includes("active") || s.includes("approve") || s.includes("success")) return "APPROVED";
  return "DRAFT";
}
