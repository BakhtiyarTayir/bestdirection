import { z } from "zod";

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "groupNameRequired")
    .max(100, "maxChars100"),
  description: z
    .string()
    .max(500, "maxChars500")
    .optional(),
  schedule: z
    .string()
    .max(200, "maxChars200")
    .optional(),
  startDate: z
    .coerce
    .date()
    .optional(),
  endDate: z
    .coerce
    .date()
    .optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = createGroupSchema.partial();

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
