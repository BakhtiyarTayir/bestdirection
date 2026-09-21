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
  // Обязателен: группа всегда занимается в конкретном филиале (решение
  // владельца 2026-09-20). Имя группы уникально внутри (courseId, branchId).
  branchId: z.string().min(1, "branchRequired"),
  description: z
    .string()
    .max(500, "maxChars500")
    .optional(),
  schedule: z
    .string()
    .max(200, "maxChars200")
    .optional(),
  // Дни занятий по ISO (1 = пн … 7 = вс). Обязательны при создании (план
  // «Уроки и карточка группы», этап 1) — иначе и пропорция начисления за
  // неполный месяц, и знаменатель в расчёте зарплаты скатываются на грубые
  // приближения. updateGroupSchema ниже (createGroupSchema.partial()) сам
  // делает поле необязательным при частичном обновлении.
  scheduleDays: z
    .array(z.number().int().min(1).max(7))
    .min(1, "scheduleDaysRequired")
    .max(7),
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
  // Ставка зарплаты группы в базисных пунктах (4000 = 40.00%). Важнее ставки
  // преподавателя (план зарплат, 5.2). Пустая строка — своей ставки нет, ноль
  // допускаем: 0% — осознанное решение админа, а не то же самое, что «пусто».
  salaryPercentBp: z
    .union([z.coerce.number().int().min(0, "percentPositive").max(10_000, "percentTooLarge"), z.literal("")])
    .optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = createGroupSchema.partial();

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
