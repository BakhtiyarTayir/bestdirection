import { redirect } from "next/navigation";
import { defaultLocale } from "@/i18n/config";
import { auth } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Префикс локали сохраняем, иначе заход на /ru открывал узбекскую страницу
  // входа. У локали по умолчанию префикса нет — localePrefix: 'as-needed'.
  const prefix = locale === defaultLocale ? "" : `/${locale}`;
  const session = await auth();
  redirect(session?.user ? `${prefix}/dashboard` : `${prefix}/login`);
}
