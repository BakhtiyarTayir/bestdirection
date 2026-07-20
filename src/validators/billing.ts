import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");

export const updateEnrollmentBillingSchema = z.object({
  // Календарные даты строкой: Date уехал бы на сутки при UTC-сериализации.
  // Пустое значение = очистить поле, поэтому optional, а не nullable.
  startsAt: dateString.optional(),
  billingEndsAt: dateString.optional(),
  priceOverride: z
    .number()
    .int("amountInteger")
    .positive("amountPositive")
    .max(1_000_000_000, "amountTooLarge")
    .optional(),
  // Начисление за первый неполный месяц; 0 допустим — студент пришёл после
  // последнего занятия месяца и за него не платит
  firstMonthCharge: z
    .number()
    .int("amountInteger")
    .min(0, "amountPositive")
    .max(1_000_000_000, "amountTooLarge")
    .optional(),
});

export type UpdateEnrollmentBillingInput = z.infer<typeof updateEnrollmentBillingSchema>;
