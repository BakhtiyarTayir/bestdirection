import { z } from "zod";

/**
 * Календарная дата строкой "YYYY-MM-DD", а не Date: Date по дороге на сервер
 * сериализуется в момент времени, и выбранная полночь по локали админа (UTC+5)
 * пришла бы как 19:00 предыдущих суток — дата уехала бы на день назад.
 * К полудню UTC её приводит dateInputToDb (src/lib/date-only.ts).
 * Пустая строка означает «очистить поле».
 */
const dateOnly = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  z.literal(""),
]);

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
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  // Цена группы за месяц. Пустая строка — цены у группы нет, берётся цена курса.
  // Ноль не допускаем: иначе пустое поле, приведённое к числу, тихо сделало бы
  // месяц бесплатным.
  price: z
    .union([z.coerce.number().int().positive("pricePositive"), z.literal("")])
    .optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = createGroupSchema.partial();

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
