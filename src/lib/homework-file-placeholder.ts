/**
 * Заглушка в поле code у работ, где студент прислал файл, а не текст решения.
 * Значение попадает в базу, поэтому оно языконезависимое, а старый русский
 * префикс продолжаем распознавать: работы, отправленные до перехода интерфейса
 * на узбекский, лежат в базе с ним и должны открываться как прежде.
 */
const PLACEHOLDER_PREFIX = "[File:";
const LEGACY_PLACEHOLDER_PREFIX = "[Файл:";

export function fileSubmissionPlaceholder(fileName: string): string {
  return `${PLACEHOLDER_PREFIX} ${fileName}]`;
}

export function isFileSubmissionPlaceholder(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.startsWith(PLACEHOLDER_PREFIX) || code.startsWith(LEGACY_PLACEHOLDER_PREFIX);
}
