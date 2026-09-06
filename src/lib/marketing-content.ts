// Контент лендинга из БД (редактируется в /admin/landing) с кэшем на тег
// "marketing". Пока таблица пуста, используются статичные значения по
// умолчанию — лендинг работает и до сида, и до миграции.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { marketingCourses as defaultCourses } from "@/lib/marketing-courses";
import { marketingReels as defaultReels } from "@/lib/marketing-reels";

export const MARKETING_TAG = "marketing";

export interface LandingCourse {
  slug: string;
  title: string;
  cover: string | null;
  summaryRu: string | null;
  summaryUz: string | null;
  price: number | null;
  intakeStartDate: Date | null;
  intakeSeats: number | null;
  intakeNoteRu: string | null;
  intakeNoteUz: string | null;
}

export interface LandingGalleryItem {
  image: string;
  titleRu: string;
  titleUz: string;
  textRu: string;
  textUz: string;
}

export interface LandingTestimonial {
  quoteRu: string;
  quoteUz: string;
  author: string;
  roleRu: string;
  roleUz: string;
}

// Карточки об учебном процессе. Иллюстрации — фирменная графика с мотивом
// дуг из логотипа; когда появятся фотографии занятий, они меняются через
// /admin/landing без правки кода.
export const defaultGalleryItems: LandingGalleryItem[] = [
  {
    image: "/marketing/process/small-groups.png",
    titleRu: "Малые группы",
    titleUz: "Kichik guruhlar",
    textRu: "До 10 человек: каждый успевает говорить на каждом занятии",
    textUz: "10 kishigacha: har darsda hammaga gapirishga vaqt yetadi",
  },
  {
    image: "/marketing/process/speaking.png",
    titleRu: "Разговорная практика",
    titleUz: "Suhbat amaliyoti",
    textRu: "Диалоги, ролевые игры и обсуждения вместо теории у доски",
    textUz: "Doskadagi nazariya o‘rniga dialog, rolli o‘yin va muhokamalar",
  },
  {
    image: "/marketing/process/level-test.png",
    titleRu: "Тест на уровень",
    titleUz: "Daraja testi",
    textRu: "Определяем уровень по CEFR и ставим цель на ближайшие три месяца",
    textUz: "CEFR bo‘yicha darajani aniqlaymiz va uch oyga maqsad qo‘yamiz",
  },
  {
    image: "/marketing/process/certificate.png",
    titleRu: "Сертификат уровня",
    titleUz: "Daraja sertifikati",
    textRu: "По итогам курса — экзамен и сертификат с указанием уровня",
    textUz: "Kurs yakunida — imtihon va daraja ko‘rsatilgan sertifikat",
  },
];

export const getLandingCourses = unstable_cache(
  async (): Promise<LandingCourse[]> => {
    const rows = await prisma.marketingCourse.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (rows.length === 0) return defaultCourses;
    return rows.filter((r) => r.published);
  },
  ["landing-courses"],
  { tags: [MARKETING_TAG] }
);

export const getLandingReels = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.marketingReel.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (rows.length === 0) return defaultReels;
    return rows.filter((r) => r.published).map((r) => r.url);
  },
  ["landing-reels"],
  { tags: [MARKETING_TAG] }
);

export const getLandingGallery = unstable_cache(
  async (): Promise<LandingGalleryItem[]> => {
    const rows = await prisma.marketingGalleryItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (rows.length === 0) return defaultGalleryItems;
    return rows.filter((r) => r.published);
  },
  ["landing-gallery"],
  { tags: [MARKETING_TAG] }
);

// Пустой массив = «отзывов в БД нет» — страница возьмёт их из messages.
export const getLandingTestimonials = unstable_cache(
  async (): Promise<LandingTestimonial[]> => {
    const rows = await prisma.marketingTestimonial.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.filter((r) => r.published);
  },
  ["landing-testimonials"],
  { tags: [MARKETING_TAG] }
);

export const getLandingTexts = unstable_cache(
  async (): Promise<Record<string, { ru: string; uz: string }>> => {
    const rows = await prisma.marketingText.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, { ru: r.ru, uz: r.uz }]));
  },
  ["landing-texts"],
  { tags: [MARKETING_TAG] }
);

/**
 * Хелпер текстов лендинга: значение из БД, а если ключа нет — фолбэк на
 * next-intl. Плейсхолдеры вида {count}/{date} подставляются простой заменой.
 */
export function makeLandingText(
  texts: Record<string, { ru: string; uz: string }>,
  locale: string,
  fallback: (key: string, values?: Record<string, string | number | Date>) => string
) {
  const lang: "ru" | "uz" = locale === "uz" ? "uz" : "ru";
  return (key: string, values?: Record<string, string | number>): string => {
    const row = texts[key];
    if (!row) return fallback(key, values);
    let out = row[lang];
    if (values) {
      for (const [k, v] of Object.entries(values)) {
        out = out.replaceAll(`{${k}}`, String(v));
      }
    }
    return out;
  };
}

export async function findLandingCourse(slug: string): Promise<LandingCourse | undefined> {
  const courses = await getLandingCourses();
  return courses.find((c) => c.slug === slug);
}

// ─── Страницы (best-direction.uz/<slug>) ──────────────────────────────────

/** Блок Editor.js; data зависит от типа блока */
export interface EditorBlock {
  id?: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export interface EditorContent {
  time?: number;
  blocks: EditorBlock[];
  version?: string;
}

export interface LandingPage {
  slug: string;
  titleRu: string;
  titleUz: string;
  contentRu: EditorContent | null;
  contentUz: EditorContent | null;
  seoTitleRu: string | null;
  seoTitleUz: string | null;
  seoDescRu: string | null;
  seoDescUz: string | null;
  showInFooter: boolean;
}

export const getLandingPages = unstable_cache(
  async (): Promise<LandingPage[]> => {
    const rows = await prisma.marketingPage.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => ({
      slug: r.slug,
      titleRu: r.titleRu,
      titleUz: r.titleUz,
      contentRu: (r.contentRu as unknown as EditorContent) ?? null,
      contentUz: (r.contentUz as unknown as EditorContent) ?? null,
      seoTitleRu: r.seoTitleRu,
      seoTitleUz: r.seoTitleUz,
      seoDescRu: r.seoDescRu,
      seoDescUz: r.seoDescUz,
      showInFooter: r.showInFooter,
    }));
  },
  ["landing-pages"],
  { tags: [MARKETING_TAG] }
);

export async function findLandingPage(slug: string): Promise<LandingPage | undefined> {
  const pages = await getLandingPages();
  return pages.find((p) => p.slug === slug);
}
