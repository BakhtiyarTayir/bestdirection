import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// Тот же формат, что monthQuerySchema в billing/finance: "YYYY-MM". Необязателен —
// без месяца сервис берёт текущий (currentMonthKey), как выбор месяца на /finance.
export const progressQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth").optional(),
});

export class ProgressQueryDto extends createZodDto(progressQuerySchema) {}
