import { z } from "zod";

export const ProgrammingLanguageEnum = z.enum([
  "PYTHON",
  "JAVASCRIPT",
  "TYPESCRIPT",
  "PHP",
  "JAVA",
  "CSHARP",
]);
export type ProgrammingLanguage = z.infer<typeof ProgrammingLanguageEnum>;

export const testCaseSchema = z.object({
  input: z.string().min(0),
  expected: z.string().min(0),
  isHidden: z.boolean().default(false),
  points: z.number().int().min(1).default(1),
  description: z.string().max(500).optional(),
});

export type TestCaseInput = z.infer<typeof testCaseSchema>;

export const createHomeworkSchema = z.object({
  title: z.string().min(1, "Название обязательно").max(200),
  description: z.string().min(1, "Описание обязательно").max(5000),
  language: ProgrammingLanguageEnum,
  starterCode: z.string().optional(),
  solutionCode: z.string().optional(),
  maxAttempts: z.number().int().min(1).max(100).default(10),
  timeLimitSec: z.number().int().min(1).max(60).default(5),
  passingScore: z.number().int().min(0).max(100).default(60),
  dueDate: z.date().nullable().optional(),
  allowLate: z.boolean().default(true),
  latePenalty: z.number().int().min(0).max(100).default(20),
  testCases: z.array(testCaseSchema).min(1, "Минимум 1 тест-кейс"),
});

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

export const updateHomeworkSchema = createHomeworkSchema.partial().extend({
  id: z.string().cuid(),
});

export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;
