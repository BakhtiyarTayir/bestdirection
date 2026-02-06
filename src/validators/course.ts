import { z } from "zod";

export const createCourseSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required"),
  description: z
    .string()
    .optional(),
  isPublished: z
    .boolean()
    .optional()
    .default(false),
  teacherId: z
    .string()
    .min(1, "Teacher ID is required"),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  id: z.string().min(1, "Course ID is required"),
  title: z
    .string()
    .min(1, "Title is required")
    .optional(),
  description: z
    .string()
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  teacherId: z
    .string()
    .min(1, "Teacher ID is required")
    .optional(),
});

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
