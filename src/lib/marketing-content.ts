// Контент лендинга из api (правится в /admin/landing) с кэшем на тег
// "marketing": сбрасывает его сам api через /api/internal/revalidate после
// правки. Пока таблицы пусты, используются статичные значения по умолчанию —
// лендинг работает и до первичного наполнения.
import { unstable_cache } from "next/cache";
import {
  getLandingContent,
  getLandingPage,
  type ApiLandingContent,
} from "@/lib/api/marketing.server";
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

/** Один запрос в api на весь лендинг; дальше всё берётся отсюда. */
const loadLanding = unstable_cache(
  async (): Promise<ApiLandingContent> => {
    const result = await getLandingContent();
    if (result.success) return result.data;

    // api недоступен — лендинг показываем на значениях по умолчанию, а не 500
    return { courses: [], reels: [], gallery: [], testimonials: [], texts: {}, pages: [], logo: null };
  },
  ["landing-content"],
  { tags: [MARKETING_TAG] }
);

export async function getLandingCourses(): Promise<LandingCourse[]> {
  const { courses } = await loadLanding();
  if (courses.length === 0) return defaultCourses;
  return courses.map((course) => ({
    ...course,
    intakeStartDate: course.intakeStartDate ? new Date(course.intakeStartDate) : null,
  }));
}

export async function getLandingReels(): Promise<string[]> {
  const { reels } = await loadLanding();
  return reels.length === 0 ? defaultReels : reels;
}

export async function getLandingGallery(): Promise<LandingGalleryItem[]> {
  const { gallery } = await loadLanding();
  return gallery.length === 0 ? defaultGalleryItems : gallery;
}

/** Пустой массив = «отзывов нет» — страница возьмёт их из messages. */
export async function getLandingTestimonials(): Promise<LandingTestimonial[]> {
  const { testimonials } = await loadLanding();
  return testimonials;
}

export async function getLandingTexts(): Promise<Record<string, { ru: string; uz: string }>> {
  const { texts } = await loadLanding();
  return texts;
}

export async function getLandingLogo(): Promise<string | null> {
  const { logo } = await loadLanding();
  return logo;
}

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

export type { EditorBlock, EditorContent } from "@/lib/api/marketing.server";

export interface LandingPage {
  slug: string;
  titleRu: string;
  titleUz: string;
  showInFooter: boolean;
}

/** Список страниц для подвала. Содержимое грузится отдельной страницей. */
export async function getLandingPages(): Promise<LandingPage[]> {
  const { pages } = await loadLanding();
  return pages;
}

export async function findLandingPage(slug: string) {
  const result = await getLandingPage(slug);
  return result.success ? result.data : undefined;
}
