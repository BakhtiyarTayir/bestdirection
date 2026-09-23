import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const adminDashboardQuerySchema = z.object({
  branchId: z.string().max(40).optional(),
});

export class AdminDashboardQueryDto extends createZodDto(adminDashboardQuerySchema) {}
