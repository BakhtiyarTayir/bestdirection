import { z } from "zod";

export const createCourseSchema = z.object({
  title: z
    .string()
    .min(1, "Название обязательно"),
  description: z
    .string()
    .optional(),
  isPublished: z
    .boolean(),
  teacherId: z
    .string()
    .min(1, "Преподаватель обязателен"),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  id: z.string().min(1, "ID курса обязателен"),
  title: z
    .string()
    .min(1, "Название обязательно")
    .optional(),
  description: z
    .string()
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  teacherId: z
    .string()
    .min(1, "Преподаватель обязателен")
    .optional(),
});

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
