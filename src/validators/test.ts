import { z } from "zod";
import { QuestionType } from "@/generated/prisma";

const questionTypeEnum = z.nativeEnum(QuestionType);

// --- Test schemas ---

export const createTestSchema = z.object({
  title: z
    .string()
    .min(1, "Название обязательно"),
  passingScore: z
    .number()
    .int("Проходной балл должен быть целым числом")
    .min(0, "Проходной балл не может быть отрицательным")
    .max(100, "Проходной балл не может превышать 100")
    .default(60),
  timeLimitMin: z
    .number()
    .int("Ограничение по времени должно быть целым числом")
    .min(1, "Ограничение по времени — минимум 1 минута")
    .optional(),
  maxAttempts: z
    .number()
    .int("Количество попыток должно быть целым числом")
    .min(1, "Минимум 1 попытка")
    .default(1),
  isPublished: z
    .boolean()
    .optional()
    .default(false),
  lessonId: z
    .string()
    .min(1, "ID урока обязателен"),
});

export type CreateTestInput = z.infer<typeof createTestSchema>;

export const updateTestSchema = z.object({
  id: z.string().min(1, "ID теста обязателен"),
  title: z
    .string()
    .min(1, "Название обязательно")
    .optional(),
  passingScore: z
    .number()
    .int("Проходной балл должен быть целым числом")
    .min(0, "Проходной балл не может быть отрицательным")
    .max(100, "Проходной балл не может превышать 100")
    .optional(),
  timeLimitMin: z
    .number()
    .int("Ограничение по времени должно быть целым числом")
    .min(1, "Ограничение по времени — минимум 1 минута")
    .nullable()
    .optional(),
  maxAttempts: z
    .number()
    .int("Количество попыток должно быть целым числом")
    .min(1, "Минимум 1 попытка")
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  lessonId: z
    .string()
    .min(1, "ID урока обязателен")
    .optional(),
});

export type UpdateTestInput = z.infer<typeof updateTestSchema>;

// --- Question schemas ---

const answerOptionSchema = z.object({
  text: z
    .string()
    .min(1, "Текст варианта ответа обязателен"),
  isCorrect: z
    .boolean()
    .default(false),
  sortOrder: z
    .number()
    .int("Порядок сортировки должен быть целым числом")
    .min(0, "Порядок сортировки не может быть отрицательным")
    .default(0),
});

export type AnswerOptionInput = z.infer<typeof answerOptionSchema>;

export const createQuestionSchema = z.object({
  text: z
    .string()
    .min(1, "Текст вопроса обязателен"),
  type: questionTypeEnum,
  points: z
    .number()
    .int("Баллы должны быть целым числом")
    .min(1, "Минимум 1 балл")
    .default(1),
  sortOrder: z
    .number()
    .int("Порядок сортировки должен быть целым числом")
    .min(0, "Порядок сортировки не может быть отрицательным")
    .default(0),
  testId: z
    .string()
    .min(1, "ID теста обязателен"),
  options: z
    .array(answerOptionSchema)
    .min(2, "Минимум 2 варианта ответа"),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// --- Test attempt submission schema ---

const attemptAnswerSchema = z.object({
  questionId: z
    .string()
    .min(1, "ID вопроса обязателен"),
  selectedOptionIds: z
    .array(z.string().min(1, "ID варианта обязателен")),
});

export type AttemptAnswerInput = z.infer<typeof attemptAnswerSchema>;

export const submitTestAttemptSchema = z.object({
  testId: z
    .string()
    .min(1, "ID теста обязателен"),
  answers: z
    .array(attemptAnswerSchema)
    .min(1, "Необходим хотя бы один ответ"),
});

export type SubmitTestAttemptInput = z.infer<typeof submitTestAttemptSchema>;
