import { z } from "zod";

export const courseAccessTypes = ["CLOSED", "FREE", "PAID"] as const;

const marketingFields = {
  accessType: z.enum(courseAccessTypes).optional(),
  isPublicListed: z.boolean().optional(),
  price: z.coerce.number().int().nonnegative().optional(),
  publicSummaryRu: z.string().max(500, "maxChars500").optional(),
  publicSummaryUz: z.string().max(500, "maxChars500").optional(),
  intakeStartDate: z.coerce.date().optional(),
  intakeSeats: z.coerce.number().int().nonnegative().optional(),
  intakeNoteRu: z.string().max(300, "maxChars300").optional(),
  intakeNoteUz: z.string().max(300, "maxChars300").optional(),
};

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
  ...marketingFields,
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
  ...marketingFields,
});

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
