import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const id = z.string().min(1).max(40);

export const createLessonSchema = z.object({
  courseId: id,
  title: z.string().trim().min(1, "titleRequired").max(200),
  content: z.string().max(200_000).default(""),
  contentFormat: z.enum(["MARKDOWN", "HTML"]).optional(),
  videoUrl: z.string().max(1000).optional(),
  videoSource: z.enum(["YOUTUBE", "UPLOAD"]).optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isPublished: z.boolean().default(false),
});

export const updateLessonSchema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(200).optional(),
  content: z.string().max(200_000).optional(),
  contentFormat: z.enum(["MARKDOWN", "HTML"]).optional(),
  videoUrl: z.string().max(1000).optional(),
  videoSource: z.enum(["YOUTUBE", "UPLOAD"]).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isPublished: z.boolean().optional(),
});

export const lessonProgressSchema = z.object({
  watchTime: z.number().int().min(0).max(1_000_000),
  lastPosition: z.number().int().min(0).max(1_000_000),
});

export const courseQuerySchema = z.object({ courseId: id });
export const courseSlugQuerySchema = z.object({ courseSlug: z.string().min(1).max(200) });

export class CreateLessonDto extends createZodDto(createLessonSchema) {}
export class UpdateLessonDto extends createZodDto(updateLessonSchema) {}
export class LessonProgressDto extends createZodDto(lessonProgressSchema) {}
export class CourseQueryDto extends createZodDto(courseQuerySchema) {}
export class CourseSlugQueryDto extends createZodDto(courseSlugQuerySchema) {}
