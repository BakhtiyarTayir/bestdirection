import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { locales } from "@/i18n/config";
import { isMarketingHost } from "@/lib/marketing-domain";
import { Toaster } from "@/components/ui/toaster";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
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
  // src/proxy.ts. A direct hit on the LMS domain (course.uportal.uz/marketing/...)
  // should 404 instead of leaking the marketing site onto the wrong domain.
  const headersList = await headers();
  const host = headersList.get("host");
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
