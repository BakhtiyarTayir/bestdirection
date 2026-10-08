import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const adminDashboardQuerySchema = z.object({
  branchId: z.string().max(40).optional(),
});

export class AdminDashboardQueryDto extends createZodDto(adminDashboardQuerySchema) {}

export const hostingPaidUntilSchema = z.object({
  paidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export class HostingPaidUntilDto extends createZodDto(hostingPaidUntilSchema) {}
