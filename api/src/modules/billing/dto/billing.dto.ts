import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// Схемы перенесены из src/validators/billing.ts и payment.ts в web. Там они
// вызывались вручную внутри действий; здесь их выполняет глобальный pipe.

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth");
const money = z.number().int("amountInteger").max(1_000_000_000, "amountTooLarge");

export const paymentMethods = ["CASH", "CARD", "PAYME", "CLICK", "TRANSFER"] as const;

export const updateEnrollmentBillingSchema = z.object({
  // Календарные даты строкой: Date уехал бы на сутки при UTC-сериализации.
  // Пустое значение = очистить поле, поэтому optional, а не nullable.
  startsAt: dateString.optional(),
  billingEndsAt: dateString.optional(),
  priceOverride: money.positive("amountPositive").optional(),
  // Начисление за первый неполный месяц; 0 допустим — студент пришёл после
  // последнего занятия месяца и за него не платит
  firstMonthCharge: money.min(0, "amountPositive").optional(),
});

export const createPaymentSchema = z.object({
  studentId: z.string().min(1, "studentRequired").max(40),
  courseId: z.string().min(1, "courseRequired").max(40),
  groupId: z.string().max(40).optional(),
  // UZS без копеек; верхняя граница отсекает опечатки вида лишнего нуля
  amount: money.positive("amountPositive"),
  method: z.enum(paymentMethods),
  // Календарная дата "YYYY-MM-DD"
  paidAt: dateString,
  // Период оплаты "YYYY-MM"
  forMonth: monthString.optional(),
  comment: z.string().max(500, "maxChars500").optional(),
});

export const paymentFiltersSchema = z.object({
  month: monthString.optional(),
  courseId: z.string().max(40).optional(),
  groupId: z.string().max(40).optional(),
  studentId: z.string().max(40).optional(),
  method: z.enum(paymentMethods).optional(),
  branchId: z.string().max(40).optional(),
  teacherId: z.string().max(40).optional(),
});

export const debtorsQuerySchema = z.object({
  month: monthString.optional(),
  courseId: z.string().max(40).optional(),
  groupId: z.string().max(40).optional(),
  // Должник считается через группу (Enrollment своего филиала не хранит):
  // ученик без группы при этом фильтре выпадает — это ожидаемо, счётчик
  // withoutGroup в ответе не даёт этому потеряться незаметно
  branchId: z.string().max(40).optional(),
  teacherId: z.string().max(40).optional(),
});

export const monthQuerySchema = z.object({ month: monthString });

export const studentsQuerySchema = z.object({
  branchId: z.string().max(40).optional(),
  teacherId: z.string().max(40).optional(),
  courseId: z.string().max(40).optional(),
  groupId: z.string().max(40).optional(),
});

export class UpdateEnrollmentBillingDto extends createZodDto(updateEnrollmentBillingSchema) {}
export class CreatePaymentDto extends createZodDto(createPaymentSchema) {}
export class PaymentFiltersDto extends createZodDto(paymentFiltersSchema) {}
export class DebtorsQueryDto extends createZodDto(debtorsQuerySchema) {}
export class MonthQueryDto extends createZodDto(monthQuerySchema) {}
export class StudentsQueryDto extends createZodDto(studentsQuerySchema) {}
