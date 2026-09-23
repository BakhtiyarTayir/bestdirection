import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const financeQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth").optional(),
  branchId: z.string().max(40).optional(),
});

export class FinanceQueryDto extends createZodDto(financeQuerySchema) {}
