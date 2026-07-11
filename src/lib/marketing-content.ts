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

export const defaultGalleryItems: LandingGalleryItem[] = [
  {
    image: "/marketing/gallery/robotics-build.png",
    titleRu: "Сборка робота",
    titleUz: "Robot yig‘ish",
    textRu: "Собираем конструкции и механизмы своими руками",
    textUz: "Konstruksiya va mexanizmlarni o‘z qo‘limiz bilan yig‘amiz",
  },
  {
    image: "/marketing/gallery/robotics-code.png",
    titleRu: "Программирование",
    titleUz: "Dasturlash",
    textRu: "Оживляем робота кодом на Python",
    textUz: "Robotni Python kodi bilan jonlantiramiz",
  },
  {
    image: "/marketing/gallery/robotics-test.png",
    titleRu: "Испытания на трассе",
    titleUz: "Trassada sinov",
    textRu: "Проверяем, как робот проходит маршрут",
    textUz: "Robot marshrutni qanday bosib o‘tishini tekshiramiz",
  },
  {
    image: "/marketing/gallery/robotics-team.png",
    titleRu: "Командные проекты",
    titleUz: "Jamoaviy loyihalar",
    textRu: "Работаем в команде и защищаем свои проекты",
    textUz: "Jamoada ishlaymiz va loyihalarimizni himoya qilamiz",
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
