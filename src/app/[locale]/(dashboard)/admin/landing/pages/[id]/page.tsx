import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { PageEditor } from "./page-editor";
import { MARKETING_DOMAIN } from "@/lib/marketing-domain";

export const dynamic = "force-dynamic";

interface AdminPageEditorProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPageEditorPage({ params }: AdminPageEditorProps) {
  await requireRole(["ADMIN"]);
  const { id } = await params;

  if (id === "new") {
    return <PageEditor page={null} marketingDomain={MARKETING_DOMAIN} />;
  }

  const page = await prisma.marketingPage.findUnique({ where: { id } });
  if (!page) notFound();

  return (
    <PageEditor
      marketingDomain={MARKETING_DOMAIN}
      page={{
        id: page.id,
        slug: page.slug,
        titleRu: page.titleRu,
        titleUz: page.titleUz,
        contentRu: page.contentRu as object | null,
        contentUz: page.contentUz as object | null,
        seoTitleRu: page.seoTitleRu,
        seoTitleUz: page.seoTitleUz,
        seoDescRu: page.seoDescRu,
        seoDescUz: page.seoDescUz,
        showInFooter: page.showInFooter,
        published: page.published,
        sortOrder: page.sortOrder,
      }}
    />
  );
}
