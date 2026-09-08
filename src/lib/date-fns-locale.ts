import { ru, uz } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { defaultLocale, type Locale } from "@/i18n/config";

const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = { uz, ru };

/**
 * Локаль date-fns по локали приложения. Нужна там, где библиотека сама рисует
 * текст — названия месяцев и дней в календаре; для числовых форматов вроде
 * dd.MM.yyyy она ни на что не влияет и передавать её не нужно.
 */
export function dateFnsLocale(locale: string): DateFnsLocale {
  return DATE_FNS_LOCALES[locale as Locale] ?? DATE_FNS_LOCALES[defaultLocale];
}
