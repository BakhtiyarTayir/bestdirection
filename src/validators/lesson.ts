import { z } from "zod";

export const LessonTypeEnum = z.enum(["VIDEO", "TEXT"]);
export const VideoSourceEnum = z.enum(["YOUTUBE", "UPLOAD"]);

export type LessonType = z.infer<typeof LessonTypeEnum>;
export type VideoSource = z.infer<typeof VideoSourceEnum>;

export const createLessonSchema = z.object({
  title: z
    .string()
    .min(1, "Название обязательно"),
  type: LessonTypeEnum,
  content: z
    .string()
    .optional(),
  videoUrl: z
    .string()
    .url("Некорректная ссылка на видео")
    .optional(),
  videoSource: VideoSourceEnum.optional(),
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
  type: LessonTypeEnum.optional(),
  content: z
    .string()
    .optional(),
  videoUrl: z
    .string()
    .url("Некорректная ссылка на видео")
    .optional(),
  videoSource: VideoSourceEnum.optional(),
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
