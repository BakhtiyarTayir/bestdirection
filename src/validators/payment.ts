import { z } from "zod";

export const paymentMethods = [
  "CASH",
  "CARD",
  "PAYME",
  "CLICK",
  "TRANSFER",
] as const;

export type PaymentMethodValue = (typeof paymentMethods)[number];

export const createPaymentSchema = z.object({
  studentId: z.string().min(1, "studentRequired"),
  courseId: z.string().min(1, "courseRequired"),
  groupId: z.string().optional(),
  // UZS без копеек; верхняя граница отсекает опечатки вида лишнего нуля
  amount: z
    .number()
    .int("amountInteger")
    .positive("amountPositive")
    .max(1_000_000_000, "amountTooLarge"),
  method: z.enum(paymentMethods),
  // Календарная дата "YYYY-MM-DD" — Date сериализуется в UTC-момент и уезжает на сутки
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  // Период оплаты "YYYY-MM"
  forMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth")
    .optional(),
  comment: z.string().max(500, "maxChars500").optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const paymentFiltersSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth")
    .optional(),
  courseId: z.string().optional(),
  groupId: z.string().optional(),
  studentId: z.string().optional(),
  method: z.enum(paymentMethods).optional(),
  branchId: z.string().optional(),
  teacherId: z.string().optional(),
});

export type PaymentFilters = z.infer<typeof paymentFiltersSchema>;
