import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const id = z.string().min(1).max(40);

export const createAssessmentSchema = z.object({
  courseId: id,
  lessonId: id.optional(),
  type: z.enum(["TEST", "EXAM"]),
  title: z.string().trim().min(1, "titleRequired").max(200),
  description: z.string().max(2000).optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  timeLimitMin: z.number().int().min(1).max(600).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isPublished: z.boolean().optional(),
});

export const updateAssessmentSchema = createAssessmentSchema
  .omit({ courseId: true, lessonId: true, type: true })
  .partial();

const optionSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  isCorrect: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const createQuestionSchema = z.object({
  assessmentId: id,
  text: z.string().trim().min(1).max(2000),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE"]),
  points: z.number().int().min(1).max(1000).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  options: z.array(optionSchema).min(2, "minTwoOptions").max(20),
});

export const updateQuestionSchema = z.object({
  text: z.string().trim().min(1).max(2000).optional(),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE"]).optional(),
  points: z.number().int().min(1).max(1000).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  options: z.array(optionSchema).min(2, "minTwoOptions").max(20).optional(),
});

export const submitAttemptSchema = z.object({
  // Массив ответов ограничен: тело запроса не должно расти без предела
  answers: z
    .array(z.object({ questionId: id, selectedOptionIds: z.array(id).max(20) }))
    .max(500),
});

export const courseQuerySchema = z.object({
  courseId: id,
  type: z.enum(["TEST", "EXAM"]).optional(),
});
export const lessonQuerySchema = z.object({ lessonId: id });
export const studentQuerySchema = z.object({ studentId: id.optional() });

export class CreateAssessmentDto extends createZodDto(createAssessmentSchema) {}
export class UpdateAssessmentDto extends createZodDto(updateAssessmentSchema) {}
export class CreateQuestionDto extends createZodDto(createQuestionSchema) {}
export class UpdateQuestionDto extends createZodDto(updateQuestionSchema) {}
export class SubmitAttemptDto extends createZodDto(submitAttemptSchema) {}
export class CourseQueryDto extends createZodDto(courseQuerySchema) {}
export class LessonQueryDto extends createZodDto(lessonQuerySchema) {}
export class StudentQueryDto extends createZodDto(studentQuerySchema) {}
