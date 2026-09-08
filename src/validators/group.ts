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
  // Дни занятий по ISO (1 = пн … 7 = вс). Пустой массив допустим: тогда
  // неполный месяц начисляется по дням, а не по занятиям (см. src/lib/billing.ts)
  scheduleDays: z
    .array(z.number().int().min(1).max(7))
    .max(7)
    .optional(),
  // Преподаватель группы. Пустая строка из <select> означает «взять
  // преподавателя курса»; в null её превращает серверное действие —
  // transform здесь ломает типы react-hook-form, разводя вход и выход схемы.
  teacherId: z.string().optional(),
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
