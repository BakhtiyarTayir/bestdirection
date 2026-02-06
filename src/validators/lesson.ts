import { z } from "zod";
import { LessonType, VideoSource } from "@/generated/prisma";

const lessonTypeEnum = z.nativeEnum(LessonType);
const videoSourceEnum = z.nativeEnum(VideoSource);

export const createLessonSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required"),
  type: lessonTypeEnum,
  content: z
    .string()
    .optional(),
  videoUrl: z
    .string()
    .url("Invalid video URL")
    .optional(),
  videoSource: videoSourceEnum.optional(),
  sortOrder: z
    .number()
    .int("Sort order must be an integer")
    .min(0, "Sort order must be non-negative")
    .default(0),
  isPublished: z
    .boolean()
    .optional()
    .default(false),
  courseId: z
    .string()
    .min(1, "Course ID is required"),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z.object({
  id: z.string().min(1, "Lesson ID is required"),
  title: z
    .string()
    .min(1, "Title is required")
    .optional(),
  type: lessonTypeEnum.optional(),
  content: z
    .string()
    .optional(),
  videoUrl: z
    .string()
    .url("Invalid video URL")
    .optional(),
  videoSource: videoSourceEnum.optional(),
  sortOrder: z
    .number()
    .int("Sort order must be an integer")
    .min(0, "Sort order must be non-negative")
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  courseId: z
    .string()
    .min(1, "Course ID is required")
    .optional(),
});

export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
