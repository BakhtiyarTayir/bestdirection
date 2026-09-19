import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const id = z.string().min(1).max(40);
const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/, "invalidSlug");

const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const marketingCourseSchema = z.object({
  id: id.optional(),
  slug,
  title: z.string().trim().min(1).max(200),
  summaryRu: optionalText(1000),
  summaryUz: optionalText(1000),
  cover: optionalText(500),
  price: z.number().int().min(0).max(100_000_000).nullish(),
  intakeStartDate: z.coerce.date().nullish(),
  intakeSeats: z.number().int().min(0).max(1000).nullish(),
  intakeNoteRu: optionalText(500),
  intakeNoteUz: optionalText(500),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  published: z.boolean().optional(),
});

export const marketingReelSchema = z.object({
  id: id.optional(),
  url: z.string().trim().url().max(500),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  published: z.boolean().optional(),
});

export const marketingGalleryItemSchema = z.object({
  id: id.optional(),
  image: z.string().trim().min(1).max(500),
  titleRu: z.string().trim().min(1).max(200),
  titleUz: z.string().trim().min(1).max(200),
  textRu: z.string().trim().max(1000),
  textUz: z.string().trim().max(1000),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  published: z.boolean().optional(),
});

export const marketingTestimonialSchema = z.object({
  id: id.optional(),
  quoteRu: z.string().trim().min(1).max(2000),
  quoteUz: z.string().trim().min(1).max(2000),
  author: z.string().trim().min(1).max(200),
  roleRu: z.string().trim().max(200),
  roleUz: z.string().trim().max(200),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  published: z.boolean().optional(),
});

/** Документ Editor.js: содержимое чистится сервисом перед записью (аудит 2.11). */
const editorContent = z
  .object({
    time: z.number().optional(),
    version: z.string().max(40).optional(),
    blocks: z.array(z.object({ id: z.string().max(60).optional(), type: z.string().max(40), data: z.unknown() })),
  })
  .nullish();

export const marketingPageSchema = z.object({
  id: id.optional(),
  slug,
  titleRu: z.string().trim().min(1).max(200),
  titleUz: z.string().trim().min(1).max(200),
  contentRu: editorContent,
  contentUz: editorContent,
  seoTitleRu: optionalText(200),
  seoTitleUz: optionalText(200),
  seoDescRu: optionalText(500),
  seoDescUz: optionalText(500),
  showInFooter: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const marketingTextsSchema = z.array(
  z.object({
    key: z.string().trim().min(1).max(200),
    ru: z.string().max(5000),
    uz: z.string().max(5000),
  })
);

/**
 * Данные для первичного наполнения. Их присылает web: статичные тексты и
 * переводы живут там, а записью в базу занимается api.
 */
export const marketingSeedSchema = z.object({
  courses: z.array(marketingCourseSchema.omit({ id: true })).max(100).optional(),
  reels: z.array(z.string().trim().url().max(500)).max(100).optional(),
  gallery: z.array(marketingGalleryItemSchema.omit({ id: true })).max(100).optional(),
  testimonials: z.array(marketingTestimonialSchema.omit({ id: true })).max(100).optional(),
  texts: marketingTextsSchema.max(500).optional(),
});

export const submitLeadSchema = z.object({
  courseSlug: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(2, "nameTooShort").max(120),
  phone: z.string().trim().min(5, "phoneTooShort").max(30),
  message: z.string().trim().max(1000).optional(),
  /** Ловушка для ботов: настоящий человек это поле не видит. */
  website: z.string().max(200).optional(),
});

export const leadContactedSchema = z.object({ contacted: z.boolean() });

export const siteLogoSchema = z.object({ url: z.string().trim().max(500) });

export class MarketingCourseDto extends createZodDto(marketingCourseSchema) {}
export class MarketingReelDto extends createZodDto(marketingReelSchema) {}
export class MarketingGalleryItemDto extends createZodDto(marketingGalleryItemSchema) {}
export class MarketingTestimonialDto extends createZodDto(marketingTestimonialSchema) {}
export class MarketingPageDto extends createZodDto(marketingPageSchema) {}
export class MarketingTextsDto extends createZodDto(z.object({ texts: marketingTextsSchema })) {}
export class MarketingSeedDto extends createZodDto(marketingSeedSchema) {}
export class SubmitLeadDto extends createZodDto(submitLeadSchema) {}
export class LeadContactedDto extends createZodDto(leadContactedSchema) {}
export class SiteLogoDto extends createZodDto(siteLogoSchema) {}
