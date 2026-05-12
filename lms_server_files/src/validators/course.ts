import { z } from "zod";

export const createCourseSchema = z.object({
  title: z
    .string()
    .min(1, "titleRequired"),
  description: z
    .string()
    .optional(),
  isPublished: z
    .boolean(),
  teacherId: z
    .string()
    .min(1, "teacherRequired"),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  id: z.string().min(1, "courseIdRequired"),
  title: z
    .string()
    .min(1, "titleRequired")
    .optional(),
  description: z
    .string()
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  teacherId: z
    .string()
    .min(1, "teacherRequired")
    .optional(),
});

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
