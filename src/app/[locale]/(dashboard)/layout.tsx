import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { defaultLocale } from "@/i18n/config";
import { Sidebar } from "@/components/sidebar";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { setRequestLocale } from "next-intl/server";
import { getSiteLogoUrl } from "@/lib/site-settings";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  // Префикс только для неосновной локали — как localePrefix: 'as-needed'.
  // С безусловным `/${locale}` адрес выходил неканоническим: /uz/login.
  if (!session?.user) {
    redirect(locale === defaultLocale ? "/login" : `/${locale}/login`);
  }

  const logoUrl = await getSiteLogoUrl();

  return (
    <div className="flex h-screen">
      <PresenceHeartbeat />
      <Sidebar
          role={session.user.role}
          userName={session.user.name || ""}
          logoUrl={logoUrl}
        />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 md:p-8 pt-16 md:pt-8">
          <BreadcrumbNav />
          {children}
        </div>
      </main>
    </div>
  );
}
