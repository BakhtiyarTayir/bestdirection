import { z } from "zod";

export const VideoSourceEnum = z.enum(["YOUTUBE", "UPLOAD"]);

export type VideoSource = z.infer<typeof VideoSourceEnum>;

export const LessonContentFormatEnum = z.enum(["MARKDOWN", "HTML"]);

export type LessonContentFormat = z.infer<typeof LessonContentFormatEnum>;

export const createLessonSchema = z.object({
  title: z
    .string()
    .min(1, "titleRequired"),
  content: z
    .string()
    .min(1, "lessonContentRequired"),
  contentFormat: LessonContentFormatEnum.optional().default("MARKDOWN"),
  videoUrl: z
    .string()
    .url("invalidVideoUrl")
    .optional(),
  videoSource: VideoSourceEnum.optional(),
  sortOrder: z
    .number()
    .int("sortOrderInteger")
    .min(0, "sortOrderNonNegative")
    .default(0),
  isPublished: z
    .boolean()
    .optional()
    .default(false),
  courseId: z
    .string()
    .min(1, "courseIdRequired"),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z.object({
  id: z.string().min(1, "lessonIdRequired"),
  title: z
    .string()
    .min(1, "titleRequired")
    .optional(),
  content: z
    .string()
    .optional(),
  contentFormat: LessonContentFormatEnum.optional(),
  videoUrl: z
    .string()
    .url("invalidVideoUrl")
    .optional(),
  videoSource: VideoSourceEnum.optional(),
  sortOrder: z
    .number()
    .int("sortOrderInteger")
    .min(0, "sortOrderNonNegative")
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  courseId: z
    .string()
    .min(1, "courseIdRequired")
    .optional(),
});

export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
