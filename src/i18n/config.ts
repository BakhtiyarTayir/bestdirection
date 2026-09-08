// Узбекский первым: порядок задаёт последовательность в переключателе языка
export const locales = ['uz', 'ru'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'uz';

// 'as-needed' — hide prefix for default locale (/dashboard instead of /uz/dashboard)
export const localePrefix = 'as-needed' as const;

export const localeNames: Record<Locale, string> = {
  uz: "O'zbek",
  ru: 'Русский',
};

export const localeFlags: Record<Locale, string> = {
  uz: '🇺🇿',
  ru: '🇷🇺',
};

// BCP 47 теги для Intl.* и date-fns: коды локалей приложения ('uz', 'ru') сами
// по себе валидны, но региональный вариант даёт правильные разделители групп,
// названия месяцев и порядок сортировки.
export const localeTags: Record<Locale, string> = {
  uz: 'uz-UZ',
  ru: 'ru-RU',
};

/** Тег для Intl.* по локали приложения; неизвестное значение падает на дефолт. */
export function intlLocale(locale: string): string {
  return localeTags[locale as Locale] ?? localeTags[defaultLocale];
}
