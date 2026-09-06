import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { locales } from "@/i18n/config";
import { isMarketingHost, isLoopbackHost, MARKETING_HOST_HEADER } from "@/lib/marketing-domain";
import { getLandingTexts, makeLandingText } from "@/lib/marketing-content";
import { Toaster } from "@/components/ui/toaster";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing" });
  const mt = makeLandingText(await getLandingTexts(), locale, t);

  return {
    title: mt("meta.title"),
    description: mt("meta.description"),
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function MarketingLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(locales, locale)) {
    notFound();
  }

  // This route tree is only meant to be reached via the host-based rewrite in
  // src/proxy.ts. A direct hit on the CRM domain (crm.best-direction.uz/marketing/...)
  // should 404 instead of leaking the marketing site onto the wrong domain.
  // На внутреннем rewrite Next подменяет Host на локальный, поэтому исходный
  // домен приходит в MARKETING_HOST_HEADER, который проставляет src/proxy.ts.
  // Заголовку верим только когда Host действительно локальный — то есть это
  // внутренний проход. Снаружи такой заголовок игнорируется, иначе лендинг
  // можно было бы вытащить на домене CRM подделкой одного заголовка.
  const headersList = await headers();
  const rawHost = headersList.get("host");
  const forwarded = headersList.get(MARKETING_HOST_HEADER);
  const host = isLoopbackHost(rawHost) && forwarded ? forwarded : rawHost;
  if (!host || !isMarketingHost(host)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
      <Toaster />
    </NextIntlClientProvider>
  );
}
