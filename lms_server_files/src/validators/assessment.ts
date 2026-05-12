import { z } from "zod";

export const AssessmentTypeEnum = z.enum(["TEST", "EXAM"]);
export type AssessmentType = z.infer<typeof AssessmentTypeEnum>;

export const QuestionTypeEnum = z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE"]);
export type QuestionType = z.infer<typeof QuestionTypeEnum>;

// ---------- Assessment CRUD ----------

export const createAssessmentSchema = z.object({
  type: AssessmentTypeEnum,
  title: z.string().min(1, "titleRequired").max(200),
  description: z.string().max(2000).optional(),
  passingScore: z.number().int().min(0).max(100).default(60),
  timeLimitMin: z.number().int().min(1).max(600).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(100).default(1),
  sortOrder: z.number().int().default(0),
  courseId: z.string().cuid(),
  lessonId: z.string().cuid().nullable().optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentSchema = createAssessmentSchema
  .partial()
  .extend({
    id: z.string().cuid(),
  });

export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

// ---------- Question ----------

export const assessmentQuestionSchema = z.object({
  text: z.string().min(1, "questionTextRequired").max(2000),
  type: QuestionTypeEnum,
  points: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  options: z
    .array(
      z.object({
        text: z.string().min(1, "answerTextRequired").max(1000),
        isCorrect: z.boolean().default(false),
      })
    )
    .min(2, "minTwoOptions"),
});

export type AssessmentQuestionInput = z.infer<typeof assessmentQuestionSchema>;

// ---------- Submit attempt ----------

export const submitAssessmentAttemptSchema = z.object({
  assessmentId: z.string().cuid(),
  answers: z.array(
    z.object({
      questionId: z.string().cuid(),
      selectedOptionIds: z.array(z.string().cuid()),
    })
  ),
});

export type SubmitAssessmentAttemptInput = z.infer<typeof submitAssessmentAttemptSchema>;
