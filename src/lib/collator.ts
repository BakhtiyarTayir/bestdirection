import { getLocale } from "next-intl/server";
import { intlLocale, defaultLocale } from "@/i18n/config";

/**
 * Коллатор для сортировки имён по алфавиту текущего языка. Локаль здесь важна:
 * узбекский ставит Oʻ и Gʻ в конец алфавита, после Z, а русский — кириллицу
 * перед латиницей. Регистр и диакритику игнорируем: «oʻ» и «Oʻ» должны стоять
 * рядом, а не в разных концах списка.
 */
export async function nameCollator(): Promise<Intl.Collator> {
  return new Intl.Collator(intlLocale(await resolveLocale()), {
    sensitivity: "base",
  });
}

// Серверные действия не всегда попадают в контекст запроса с локалью
// (например, вызов из вебхука); там сортируем по языку по умолчанию.
async function resolveLocale(): Promise<string> {
  try {
    return await getLocale();
  } catch {
    return defaultLocale;
  }
}
