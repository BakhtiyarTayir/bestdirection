import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const financeQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth").optional(),
  branchId: z.string().max(40).optional(),
});

export class FinanceQueryDto extends createZodDto(financeQuerySchema) {}

const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth");

export const handoverFiltersSchema = z.object({
  month: monthString.optional(),
  branchId: z.string().max(40).optional(),
});

export const createHandoverSchema = z.object({
  // Сдают прибыль конкретного филиала: без филиала «осталось на руках» не посчитать
  branchId: z.string().min(1, "branchRequired").max(40),
  amount: z.number().int("amountInteger").positive("amountPositive").max(1_000_000_000, "amountTooLarge"),
  handedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  forMonth: monthString,
  receivedBy: z.string().max(200, "maxChars200").optional(),
  comment: z.string().max(500, "maxChars500").optional(),
});

export class HandoverFiltersDto extends createZodDto(handoverFiltersSchema) {}
export class CreateHandoverDto extends createZodDto(createHandoverSchema) {}
