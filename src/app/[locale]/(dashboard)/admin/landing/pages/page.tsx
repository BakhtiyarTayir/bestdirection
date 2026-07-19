import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { PagesList } from "./pages-list";

export const dynamic = "force-dynamic";

export default async function AdminLandingPagesPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("landingAdmin");

  const pages = await prisma.marketingPage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      titleRu: true,
      titleUz: true,
      published: true,
      showInFooter: true,
      sortOrder: true,
    },
  });

  return (
    <div>
      <h1 className="mb-1 text-3xl font-bold">{t("pagesTitle")}</h1>
      <p className="mb-6 text-muted-foreground">{t("pagesSubtitle")}</p>
      <PagesList rows={pages} />
    </div>
  );
}
