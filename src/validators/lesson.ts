import { z } from "zod";
import { LessonType, VideoSource } from "@/generated/prisma";

const lessonTypeEnum = z.nativeEnum(LessonType);
const videoSourceEnum = z.nativeEnum(VideoSource);

export const createLessonSchema = z.object({
  title: z
    .string()
    .min(1, "Название обязательно"),
  type: lessonTypeEnum,
  content: z
    .string()
    .optional(),
  videoUrl: z
    .string()
    .url("Некорректная ссылка на видео")
    .optional(),
  videoSource: videoSourceEnum.optional(),
  sortOrder: z
    .number()
    .int("Порядок сортировки должен быть целым числом")
    .min(0, "Порядок сортировки не может быть отрицательным")
    .default(0),
  isPublished: z
    .boolean()
    .optional()
    .default(false),
  courseId: z
    .string()
    .min(1, "ID курса обязателен"),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z.object({
  id: z.string().min(1, "ID урока обязателен"),
  title: z
    .string()
    .min(1, "Название обязательно")
    .optional(),
  type: lessonTypeEnum.optional(),
  content: z
    .string()
    .optional(),
  videoUrl: z
    .string()
    .url("Некорректная ссылка на видео")
    .optional(),
  videoSource: videoSourceEnum.optional(),
  sortOrder: z
    .number()
    .int("Порядок сортировки должен быть целым числом")
    .min(0, "Порядок сортировки не может быть отрицательным")
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  courseId: z
    .string()
    .min(1, "ID курса обязателен")
    .optional(),
});

export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
