import { z } from "zod";
import { QuestionType } from "@/generated/prisma";

const questionTypeEnum = z.nativeEnum(QuestionType);

// --- Test schemas ---

export const createTestSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required"),
  passingScore: z
    .number()
    .int("Passing score must be an integer")
    .min(0, "Passing score must be non-negative")
    .max(100, "Passing score cannot exceed 100")
    .default(60),
  timeLimitMin: z
    .number()
    .int("Time limit must be an integer")
    .min(1, "Time limit must be at least 1 minute")
    .optional(),
  maxAttempts: z
    .number()
    .int("Max attempts must be an integer")
    .min(1, "Must allow at least 1 attempt")
    .default(1),
  isPublished: z
    .boolean()
    .optional()
    .default(false),
  lessonId: z
    .string()
    .min(1, "Lesson ID is required"),
});

export type CreateTestInput = z.infer<typeof createTestSchema>;

export const updateTestSchema = z.object({
  id: z.string().min(1, "Test ID is required"),
  title: z
    .string()
    .min(1, "Title is required")
    .optional(),
  passingScore: z
    .number()
    .int("Passing score must be an integer")
    .min(0, "Passing score must be non-negative")
    .max(100, "Passing score cannot exceed 100")
    .optional(),
  timeLimitMin: z
    .number()
    .int("Time limit must be an integer")
    .min(1, "Time limit must be at least 1 minute")
    .nullable()
    .optional(),
  maxAttempts: z
    .number()
    .int("Max attempts must be an integer")
    .min(1, "Must allow at least 1 attempt")
    .optional(),
  isPublished: z
    .boolean()
    .optional(),
  lessonId: z
    .string()
    .min(1, "Lesson ID is required")
    .optional(),
});

export type UpdateTestInput = z.infer<typeof updateTestSchema>;

// --- Question schemas ---

const answerOptionSchema = z.object({
  text: z
    .string()
    .min(1, "Option text is required"),
  isCorrect: z
    .boolean()
    .default(false),
  sortOrder: z
    .number()
    .int("Sort order must be an integer")
    .min(0, "Sort order must be non-negative")
    .default(0),
});

export type AnswerOptionInput = z.infer<typeof answerOptionSchema>;

export const createQuestionSchema = z.object({
  text: z
    .string()
    .min(1, "Question text is required"),
  type: questionTypeEnum,
  points: z
    .number()
    .int("Points must be an integer")
    .min(1, "Points must be at least 1")
    .default(1),
  sortOrder: z
    .number()
    .int("Sort order must be an integer")
    .min(0, "Sort order must be non-negative")
    .default(0),
  testId: z
    .string()
    .min(1, "Test ID is required"),
  options: z
    .array(answerOptionSchema)
    .min(2, "At least 2 answer options are required"),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// --- Test attempt submission schema ---

const attemptAnswerSchema = z.object({
  questionId: z
    .string()
    .min(1, "Question ID is required"),
  selectedOptionIds: z
    .array(z.string().min(1, "Option ID is required")),
});

export type AttemptAnswerInput = z.infer<typeof attemptAnswerSchema>;

export const submitTestAttemptSchema = z.object({
  testId: z
    .string()
    .min(1, "Test ID is required"),
  answers: z
    .array(attemptAnswerSchema)
    .min(1, "At least one answer is required"),
});

export type SubmitTestAttemptInput = z.infer<typeof submitTestAttemptSchema>;
