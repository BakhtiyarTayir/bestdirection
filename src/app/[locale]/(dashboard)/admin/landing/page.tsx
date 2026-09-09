import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { getSiteLogoUrl } from "@/lib/site-settings";
import { LandingAdmin } from "./landing-admin";

export const dynamic = "force-dynamic";

interface AdminLandingPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminLandingPage({ searchParams }: AdminLandingPageProps) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("landingAdmin");
  const { tab } = await searchParams;

  // Страницы переехали в отдельный раздел — старые ссылки ?tab=pages ведём туда
  if (tab === "pages") redirect("/admin/landing/pages");

  const [courses, reels, gallery, testimonials, texts, logoUrl] = await Promise.all([
    prisma.marketingCourse.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingReel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingGalleryItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingTestimonial.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingText.findMany({ orderBy: { key: "asc" } }),
    getSiteLogoUrl(),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-3xl font-bold">{t("title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("subtitle")}</p>
      <LandingAdmin
        courses={courses}
        reels={reels}
        gallery={gallery}
        testimonials={testimonials}
        texts={texts}
        logoUrl={logoUrl}
        initialTab={tab}
      />
    </div>
  );
}
