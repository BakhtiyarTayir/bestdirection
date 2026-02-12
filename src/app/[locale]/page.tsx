import { redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session?.user) {
    redirect({ href: "/dashboard", locale });
  } else {
    redirect({ href: "/login", locale });
  }
}
