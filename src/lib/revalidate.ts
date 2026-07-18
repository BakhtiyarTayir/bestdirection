import { revalidatePath } from "next/cache";
import { locales, defaultLocale } from "@/i18n/config";

/**
 * Инвалидирует путь во всех локалях. При localePrefix: "as-needed"
 * дефолтная локаль живёт без префикса (/courses), остальные — с ним
 * (/uz/courses); revalidatePath с "голым" путём вторые не задевает.
 */
export function revalidateLocalized(path: string) {
  revalidatePath(path);
  for (const locale of locales) {
    if (locale !== defaultLocale) {
      revalidatePath(`/${locale}${path}`);
    }
  }
}
