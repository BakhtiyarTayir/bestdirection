import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getMarketingAdminContent } from "@/lib/api/marketing.server";
import { PagesList } from "./pages-list";

export const dynamic = "force-dynamic";

export default async function AdminLandingPagesPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("landingAdmin");

  const result = await getMarketingAdminContent();
  const pages = result.success ? result.data.pages : [];

  return (
    <div>
      <h1 className="mb-1 text-3xl font-bold">{t("pagesTitle")}</h1>
      <p className="mb-6 text-muted-foreground">{t("pagesSubtitle")}</p>
      <PagesList rows={pages} />
    </div>
  );
}
