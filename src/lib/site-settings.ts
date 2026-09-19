import { cache } from "react";
import { getSiteLogo } from "@/lib/api/marketing.server";

/** Логотип, общий для CRM и лендинга. Хранит и проверяет его api. */
export const SITE_LOGO_KEY = "siteLogoUrl";

/** Файлы в public — их и показываем, пока свой логотип не загружен. */
export const DEFAULT_LOGO_URL = "/logo.png";
export const DEFAULT_MARKETING_LOGO_URL = "/marketing/logo.png";

/**
 * Загруженный логотип или null. Обёрнут в cache: шапка, подвал и сайдбар
 * спрашивают его в одном рендере, а запрос нужен один.
 *
 * Недоступный api не роняет страницу: лендинг публичный, и логотип из public
 * лучше пустого экрана.
 */
export const getSiteLogoUrl = cache(async (): Promise<string | null> => {
  const result = await getSiteLogo();
  return result.success ? (result.data.url?.trim() || null) : null;
});
