import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { LandingAdmin } from "./landing-admin";

export const dynamic = "force-dynamic";

interface AdminLandingPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminLandingPage({ searchParams }: AdminLandingPageProps) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("landingAdmin");
  const { tab } = await searchParams;

  const [courses, reels, gallery, testimonials, texts, pages] = await Promise.all([
    prisma.marketingCourse.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingReel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingGalleryItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingTestimonial.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingText.findMany({ orderBy: { key: "asc" } }),
    prisma.marketingPage.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, slug: true, titleRu: true, titleUz: true, published: true, showInFooter: true, sortOrder: true },
    }),
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
        pages={pages}
        initialTab={tab}
      />
    </div>
  );
}
