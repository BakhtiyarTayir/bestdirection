import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const id = z.string().min(1).max(40);

const testCaseSchema = z.object({
  input: z.string().max(10_000),
  expected: z.string().max(10_000),
  isHidden: z.boolean().optional(),
  points: z.number().int().min(0).max(1000).optional(),
  description: z.string().max(1000).nullish(),
});

// Тип задания: CODE отключён решением владельца (Piston не поднимаем), но
// значение остаётся в схеме — в базе такие задания могут лежать с прошлого.
const homeworkType = z.enum(["CODE", "TEXT", "FILE"]);
const language = z.enum(["PYTHON", "JAVASCRIPT", "TYPESCRIPT", "PHP", "JAVA", "CSHARP"]);

export const createHomeworkSchema = z.object({
  lessonId: id,
  title: z.string().trim().min(1, "titleRequired").max(200),
  description: z.string().max(50_000).default(""),
  type: homeworkType.optional(),
  language: language.optional(),
  starterCode: z.string().max(100_000).optional(),
  solutionCode: z.string().max(100_000).optional(),
  maxAttempts: z.number().int().min(1).max(100).optional(),
  timeLimitSec: z.number().int().min(1).max(300).optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  // Строка с датой: тело запроса — JSON, объекта Date в нём не бывает
  dueDate: z.coerce.date().nullish(),
  allowLate: z.boolean().optional(),
  latePenalty: z.number().int().min(0).max(100).optional(),
  isPublished: z.boolean().optional(),
  testCases: z.array(testCaseSchema).max(200).optional(),
});

export const updateHomeworkSchema = createHomeworkSchema
  .omit({ lessonId: true })
  .partial();

export const lessonQuerySchema = z.object({ lessonId: id });

export class CreateHomeworkDto extends createZodDto(createHomeworkSchema) {}
export class UpdateHomeworkDto extends createZodDto(updateHomeworkSchema) {}
export class LessonQueryDto extends createZodDto(lessonQuerySchema) {}
