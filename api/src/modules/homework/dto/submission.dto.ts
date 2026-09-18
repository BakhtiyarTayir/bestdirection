import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const submitSolutionSchema = z.object({
  code: z.string().max(200_000),
});

export const reviewSubmissionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "REVISION"]),
  comment: z.string().max(5000).optional(),
  // Верхнюю границу проверяет сервис: она зависит от maxScore задания (аудит 3.6)
  manualScore: z.number().int().min(0).max(100_000).nullish(),
});

export class SubmitSolutionDto extends createZodDto(submitSolutionSchema) {}
export class ReviewSubmissionDto extends createZodDto(reviewSubmissionSchema) {}
