export const locales = ['ru', 'uz'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ru';

// 'as-needed' — hide prefix for default locale (/dashboard instead of /ru/dashboard)
export const localePrefix = 'as-needed' as const;

export const localeNames: Record<Locale, string> = {
  ru: 'Русский',
  uz: "O'zbek",
};

export const localeFlags: Record<Locale, string> = {
  ru: '🇷🇺',
  uz: '🇺🇿',
};
