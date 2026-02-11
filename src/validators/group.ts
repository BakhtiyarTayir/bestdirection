import { z } from "zod";

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, "Название группы обязательно")
    .max(100, "Максимум 100 символов"),
  description: z
    .string()
    .max(500, "Максимум 500 символов")
    .optional(),
  schedule: z
    .string()
    .max(200, "Максимум 200 символов")
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
