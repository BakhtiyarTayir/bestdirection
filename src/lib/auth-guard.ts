import { auth } from "./auth";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";

/**
 * Путь с префиксом текущей локали. Без него redirect уводил на /login и
 * /dashboard, то есть на язык по умолчанию: русский пользователь после
 * переброса оказывался на узбекском интерфейсе.
 *
 * Правило префикса повторяет localePrefix: 'as-needed' из i18n/config —
 * у локали по умолчанию префикса нет, иначе адрес получился бы
 * неканоническим (/uz/login вместо /login).
 */
async function localizedPath(path: string) {
  const locale = await getLocale();
  return locale === defaultLocale ? path : `/${locale}${path}`;
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect(await localizedPath("/login"));
  return session;
}

export async function requireRole(roles: string[]) {
  const session = await requireAuth();
  if (!roles.includes(session.user.role)) {
    redirect(await localizedPath("/dashboard"));
  }
  return session;
}
