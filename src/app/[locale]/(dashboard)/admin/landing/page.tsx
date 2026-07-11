import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { LandingAdmin } from "./landing-admin";

export const dynamic = "force-dynamic";

export default async function AdminLandingPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("landingAdmin");

  const [courses, reels, gallery, testimonials, texts] = await Promise.all([
    prisma.marketingCourse.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingReel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingGalleryItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingTestimonial.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.marketingText.findMany({ orderBy: { key: "asc" } }),
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
      />
    </div>
  );
}
