import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { getMarketingAdminContent } from "@/lib/api/marketing.server";
import { getSiteLogoUrl } from "@/lib/site-settings";
import { defaultGalleryItems } from "@/lib/marketing-content";
import { marketingCourses as defaultCourses } from "@/lib/marketing-courses";
import { marketingReels as defaultReels } from "@/lib/marketing-reels";
import ruMessages from "@/i18n/messages/ru.json";
import uzMessages from "@/i18n/messages/uz.json";
import { LandingAdmin } from "./landing-admin";

export const dynamic = "force-dynamic";

interface AdminLandingPageProps {
  searchParams: Promise<{ tab?: string }>;
}

// Ключи, которые редактируются не как «тексты», а в своих вкладках
const TEXT_KEY_EXCLUDE = /^(gallery\.item|testimonials\.items)/;

type Messages = Record<string, unknown>;

function flattenMarketing(messages: Messages): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown, prefix: string) => {
    if (typeof node === "string") {
      if (!TEXT_KEY_EXCLUDE.test(prefix)) out[prefix] = node;
      return;
    }
    if (Array.isArray(node) || node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      walk(value, prefix ? `${prefix}.${key}` : key);
    }
  };
  walk((messages as { marketing?: unknown }).marketing ?? {}, "");
  return out;
}

/**
 * Значения для первичного наполнения. Статичные тексты и переводы живут здесь,
 * рядом с вёрсткой; api получает их готовыми и пишет в пустые таблицы.
 */
function buildSeedPayload() {
  const ru = flattenMarketing(ruMessages as Messages);
  const uz = flattenMarketing(uzMessages as Messages);

  const ruItems = ((ruMessages as Messages).marketing as { testimonials?: { items?: unknown } })
    ?.testimonials?.items as Array<{ quote: string; author: string; role: string }> | undefined;
  const uzItems = ((uzMessages as Messages).marketing as { testimonials?: { items?: unknown } })
    ?.testimonials?.items as Array<{ quote: string; author: string; role: string }> | undefined;

  return {
    courses: defaultCourses,
    reels: defaultReels,
    gallery: defaultGalleryItems,
    testimonials: (ruItems ?? []).map((item, index) => ({
      quoteRu: item.quote,
      quoteUz: uzItems?.[index]?.quote ?? item.quote,
      author: item.author,
      roleRu: item.role,
      roleUz: uzItems?.[index]?.role ?? item.role,
    })),
    texts: Object.keys(ru).map((key) => ({ key, ru: ru[key], uz: uz[key] ?? ru[key] })),
  };
}

export default async function AdminLandingPage({ searchParams }: AdminLandingPageProps) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("landingAdmin");
  const { tab } = await searchParams;

  // Страницы переехали в отдельный раздел — старые ссылки ?tab=pages ведём туда
  if (tab === "pages") redirect("/admin/landing/pages");

  const [contentResult, logoUrl] = await Promise.all([getMarketingAdminContent(), getSiteLogoUrl()]);
  const content = contentResult.success
    ? contentResult.data
    : { courses: [], reels: [], gallery: [], testimonials: [], texts: [], pages: [] };

  return (
    <div>
      <h1 className="mb-1 text-3xl font-bold">{t("title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("subtitle")}</p>
      <LandingAdmin
        courses={content.courses}
        reels={content.reels}
        gallery={content.gallery}
        testimonials={content.testimonials}
        texts={content.texts}
        logoUrl={logoUrl}
        seedPayload={buildSeedPayload()}
        initialTab={tab}
      />
    </div>
  );
}
