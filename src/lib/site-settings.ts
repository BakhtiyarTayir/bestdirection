import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Логотип, общий для CRM и лендинга. */
export const SITE_LOGO_KEY = "siteLogoUrl";

/** Файлы в public — их и показываем, пока свой логотип не загружен. */
export const DEFAULT_LOGO_URL = "/logo.png";
export const DEFAULT_MARKETING_LOGO_URL = "/marketing/logo.png";

/**
 * Загруженный логотип или null. Обёрнут в cache: шапка, подвал и сайдбар
 * спрашивают его в одном рендере, а запрос нужен один.
 */
export const getSiteLogoUrl = cache(async (): Promise<string | null> => {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: SITE_LOGO_KEY },
      select: { value: true },
    });
    return row?.value?.trim() || null;
  } catch {
    // Лендинг публичный: недоступная база не должна ронять страницу целиком —
    // покажем логотип из public.
    return null;
  }
});
