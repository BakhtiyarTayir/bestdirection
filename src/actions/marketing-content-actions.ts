"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { updateTag } from "next/cache";
import {
  MARKETING_TAG,
  defaultGalleryItems,
} from "@/lib/marketing-content";
import { marketingCourses as defaultCourses } from "@/lib/marketing-courses";
import { marketingReels as defaultReels } from "@/lib/marketing-reels";
import {
  marketingCourseSchema,
  marketingReelSchema,
  marketingGalleryItemSchema,
  marketingTestimonialSchema,
  marketingTextsSchema,
  marketingPageSchema,
  type MarketingCourseInput,
  type MarketingReelInput,
  type MarketingGalleryItemInput,
  type MarketingTestimonialInput,
  type MarketingTextsInput,
  type MarketingPageInput,
} from "@/validators/marketing";
import { Prisma } from "@/generated/prisma";
import ruMessages from "@/i18n/messages/ru.json";
import uzMessages from "@/i18n/messages/uz.json";

const ADMIN = { roles: ["ADMIN"] };

function published() {
  updateTag(MARKETING_TAG);
}

// ---------- чтение всего контента для админки (без кэша) ----------
export async function getLandingAdminContent() {
  return withAuth(async () => {
    const [courses, reels, gallery, testimonials, texts] = await Promise.all([
      prisma.marketingCourse.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      prisma.marketingReel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      prisma.marketingGalleryItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      prisma.marketingTestimonial.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      prisma.marketingText.findMany({ orderBy: { key: "asc" } }),
    ]);
    return { success: true as const, courses, reels, gallery, testimonials, texts };
  }, ADMIN);
}

// ---------- курсы ----------
export async function saveMarketingCourse(input: MarketingCourseInput) {
  return withAuth(async () => {
    const parsed = marketingCourseSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "invalidInput" };
    const { id, ...data } = parsed.data;

    const clash = await prisma.marketingCourse.findUnique({ where: { slug: data.slug } });
    if (clash && clash.id !== id) return { success: false as const, error: "slugTaken" };

    const row = id
      ? await prisma.marketingCourse.update({ where: { id }, data })
      : await prisma.marketingCourse.create({ data });
    published();
    return { success: true as const, id: row.id };
  }, ADMIN);
}

export async function deleteMarketingCourse(id: string) {
  return withAuth(async () => {
    await prisma.marketingCourse.delete({ where: { id } });
    published();
    return { success: true as const };
  }, ADMIN);
}

// ---------- reels ----------
export async function saveMarketingReel(input: MarketingReelInput) {
  return withAuth(async () => {
    const parsed = marketingReelSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "invalidInput" };
    const { id, ...data } = parsed.data;
    const row = id
      ? await prisma.marketingReel.update({ where: { id }, data })
      : await prisma.marketingReel.create({ data });
    published();
    return { success: true as const, id: row.id };
  }, ADMIN);
}

export async function deleteMarketingReel(id: string) {
  return withAuth(async () => {
    await prisma.marketingReel.delete({ where: { id } });
    published();
    return { success: true as const };
  }, ADMIN);
}

// ---------- галерея ----------
export async function saveMarketingGalleryItem(input: MarketingGalleryItemInput) {
  return withAuth(async () => {
    const parsed = marketingGalleryItemSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "invalidInput" };
    const { id, ...data } = parsed.data;
    const row = id
      ? await prisma.marketingGalleryItem.update({ where: { id }, data })
      : await prisma.marketingGalleryItem.create({ data });
    published();
    return { success: true as const, id: row.id };
  }, ADMIN);
}

export async function deleteMarketingGalleryItem(id: string) {
  return withAuth(async () => {
    await prisma.marketingGalleryItem.delete({ where: { id } });
    published();
    return { success: true as const };
  }, ADMIN);
}

// ---------- отзывы ----------
export async function saveMarketingTestimonial(input: MarketingTestimonialInput) {
  return withAuth(async () => {
    const parsed = marketingTestimonialSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "invalidInput" };
    const { id, ...data } = parsed.data;
    const row = id
      ? await prisma.marketingTestimonial.update({ where: { id }, data })
      : await prisma.marketingTestimonial.create({ data });
    published();
    return { success: true as const, id: row.id };
  }, ADMIN);
}

export async function deleteMarketingTestimonial(id: string) {
  return withAuth(async () => {
    await prisma.marketingTestimonial.delete({ where: { id } });
    published();
    return { success: true as const };
  }, ADMIN);
}

// ---------- страницы ----------

// Слаги, занятые роутингом (префиксы локалей, служебные пути)
const RESERVED_PAGE_SLUGS = new Set(["ru", "uz", "api", "marketing", "login", "register"]);

export async function saveMarketingPage(input: MarketingPageInput) {
  return withAuth(async () => {
    const parsed = marketingPageSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "invalidInput" };
    const { id, contentRu, contentUz, ...data } = parsed.data;

    if (RESERVED_PAGE_SLUGS.has(data.slug)) return { success: false as const, error: "slugTaken" };
    const clash = await prisma.marketingPage.findUnique({ where: { slug: data.slug } });
    if (clash && clash.id !== id) return { success: false as const, error: "slugTaken" };

    const jsonData = {
      ...data,
      contentRu: contentRu ? (contentRu as Prisma.InputJsonValue) : Prisma.JsonNull,
      contentUz: contentUz ? (contentUz as Prisma.InputJsonValue) : Prisma.JsonNull,
    };
    const row = id
      ? await prisma.marketingPage.update({ where: { id }, data: jsonData })
      : await prisma.marketingPage.create({ data: jsonData });
    published();
    return { success: true as const, id: row.id };
  }, ADMIN);
}

export async function deleteMarketingPage(id: string) {
  return withAuth(async () => {
    await prisma.marketingPage.delete({ where: { id } });
    published();
    return { success: true as const };
  }, ADMIN);
}

// ---------- тексты ----------
export async function saveMarketingTexts(input: MarketingTextsInput) {
  return withAuth(async () => {
    const parsed = marketingTextsSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "invalidInput" };
    await prisma.$transaction(
      parsed.data.map(({ key, ru, uz }) =>
        prisma.marketingText.upsert({
          where: { key },
          create: { key, ru, uz },
          update: { ru, uz },
        })
      )
    );
    published();
    return { success: true as const };
  }, ADMIN);
}

// ---------- сид из текущего статичного контента ----------

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
    for (const [k, v] of Object.entries(node)) {
      walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  walk((messages as { marketing?: unknown }).marketing ?? {}, "");
  return out;
}

/**
 * Заполняет ПУСТЫЕ таблицы контента значениями текущего сайта (статичные
 * массивы + messages). Непустые таблицы не трогает — сид можно вызывать
 * повторно без риска затереть правки.
 */
export async function seedMarketingContent() {
  return withAuth(async () => {
    const seeded: string[] = [];

    if ((await prisma.marketingCourse.count()) === 0) {
      await prisma.marketingCourse.createMany({
        data: defaultCourses.map((c, i) => ({ ...c, sortOrder: i })),
      });
      seeded.push("courses");
    }

    if ((await prisma.marketingReel.count()) === 0) {
      await prisma.marketingReel.createMany({
        data: defaultReels.map((url, i) => ({ url, sortOrder: i })),
      });
      seeded.push("reels");
    }

    if ((await prisma.marketingGalleryItem.count()) === 0) {
      await prisma.marketingGalleryItem.createMany({
        data: defaultGalleryItems.map((g, i) => ({ ...g, sortOrder: i })),
      });
      seeded.push("gallery");
    }

    if ((await prisma.marketingTestimonial.count()) === 0) {
      const ru = (ruMessages.marketing?.testimonials?.items ?? []) as Array<{
        quote: string;
        author: string;
        role: string;
      }>;
      const uz = (uzMessages.marketing?.testimonials?.items ?? []) as Array<{
        quote: string;
        author: string;
        role: string;
      }>;
      await prisma.marketingTestimonial.createMany({
        data: ru.map((item, i) => ({
          quoteRu: item.quote,
          quoteUz: uz[i]?.quote ?? item.quote,
          author: item.author,
          roleRu: item.role,
          roleUz: uz[i]?.role ?? item.role,
          sortOrder: i,
        })),
      });
      seeded.push("testimonials");
    }

    if ((await prisma.marketingText.count()) === 0) {
      const ru = flattenMarketing(ruMessages as Messages);
      const uz = flattenMarketing(uzMessages as Messages);
      await prisma.marketingText.createMany({
        data: Object.keys(ru).map((key) => ({
          key,
          ru: ru[key],
          uz: uz[key] ?? ru[key],
        })),
      });
      seeded.push("texts");
    }

    published();
    return { success: true as const, seeded };
  }, ADMIN);
}
