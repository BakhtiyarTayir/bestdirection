import { z } from "zod";

const sortOrder = z.coerce.number().int().min(-1000).max(1000).default(0);
const published = z.boolean().default(true);
const optionalText = z
  .string()
  .max(2000)
  .transform((v) => v.trim() || null)
  .nullable()
  .optional();

export const marketingCourseSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slugFormat"),
  title: z.string().trim().min(1).max(200),
  summaryRu: optionalText,
  summaryUz: optionalText,
  cover: optionalText,
  price: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  intakeStartDate: z.coerce.date().nullable().optional(),
  intakeSeats: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
  intakeNoteRu: optionalText,
  intakeNoteUz: optionalText,
  sortOrder,
  published,
});
export type MarketingCourseInput = z.infer<typeof marketingCourseSchema>;

export const marketingReelSchema = z.object({
  id: z.string().optional(),
  url: z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((u) => /^https:\/\/(www\.)?instagram\.com\/(p|reel)\//.test(u), "instagramUrl"),
  sortOrder,
  published,
});
export type MarketingReelInput = z.infer<typeof marketingReelSchema>;

export const marketingGalleryItemSchema = z.object({
  id: z.string().optional(),
  image: z.string().trim().min(1).max(500),
  titleRu: z.string().trim().min(1).max(200),
  titleUz: z.string().trim().min(1).max(200),
  textRu: z.string().trim().min(1).max(500),
  textUz: z.string().trim().min(1).max(500),
  sortOrder,
  published,
});
export type MarketingGalleryItemInput = z.infer<typeof marketingGalleryItemSchema>;

export const marketingTestimonialSchema = z.object({
  id: z.string().optional(),
  quoteRu: z.string().trim().min(1).max(1000),
  quoteUz: z.string().trim().min(1).max(1000),
  author: z.string().trim().min(1).max(120),
  roleRu: z.string().trim().min(1).max(120),
  roleUz: z.string().trim().min(1).max(120),
  sortOrder,
  published,
});
export type MarketingTestimonialInput = z.infer<typeof marketingTestimonialSchema>;

// Editor.js JSON: {blocks: [{type, data}, ...]}
const editorContent = z
  .object({
    time: z.number().optional(),
    blocks: z.array(z.object({ id: z.string().optional(), type: z.string().max(40), data: z.record(z.string(), z.unknown()) })).max(300),
    version: z.string().optional(),
  })
  .nullable()
  .optional();

const optionalShort = z
  .string()
  .max(300)
  .transform((v) => v.trim() || null)
  .nullable()
  .optional();

export const marketingPageSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slugFormat"),
  titleRu: z.string().trim().min(1).max(200),
  titleUz: z.string().trim().min(1).max(200),
  contentRu: editorContent,
  contentUz: editorContent,
  seoTitleRu: optionalShort,
  seoTitleUz: optionalShort,
  seoDescRu: optionalShort,
  seoDescUz: optionalShort,
  showInFooter: z.boolean().default(false),
  sortOrder,
  published: z.boolean().default(false),
});
export type MarketingPageInput = z.infer<typeof marketingPageSchema>;

export const marketingTextsSchema = z
  .array(
    z.object({
      key: z.string().min(1).max(120),
      ru: z.string().max(2000),
      uz: z.string().max(2000),
    })
  )
  .max(300);
export type MarketingTextsInput = z.infer<typeof marketingTextsSchema>;
