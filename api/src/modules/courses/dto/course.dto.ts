import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const accessType = z.enum(["CLOSED", "FREE", "PAID"]);
const money = z.number().int().min(0).max(1_000_000_000);
const text = (max: number) => z.string().trim().max(max);

const courseFields = {
  description: text(5000).optional(),
  coverImage: text(500).nullable().optional(),
  accessType: accessType.optional(),
  isPublicListed: z.boolean().optional(),
  price: money.optional(),
  publicSummaryRu: text(2000).optional(),
  publicSummaryUz: text(2000).optional(),
  // Календарная дата строкой: Date уехал бы на сутки при UTC-сериализации
  intakeStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate").optional(),
  intakeSeats: z.number().int().min(0).max(10_000).optional(),
  intakeNoteRu: text(500).optional(),
  intakeNoteUz: text(500).optional(),
};

export const createCourseSchema = z.object({
  title: text(200).min(1, "titleRequired"),
  teacherId: z.string().min(1, "teacherRequired").max(40),
  ...courseFields,
});

export const updateCourseSchema = z.object({
  title: text(200).min(1, "titleRequired").optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  ...courseFields,
});

export const enrollStudentSchema = z.object({ studentId: z.string().min(1).max(40) });

export const enrolledStudentsQuerySchema = z.object({ groupId: z.string().max(40).optional() });

export class CreateCourseDto extends createZodDto(createCourseSchema) {}
export class UpdateCourseDto extends createZodDto(updateCourseSchema) {}
export class EnrollStudentDto extends createZodDto(enrollStudentSchema) {}
export class EnrolledStudentsQueryDto extends createZodDto(enrolledStudentsQuerySchema) {}
