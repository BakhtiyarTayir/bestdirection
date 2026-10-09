import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { paymentMethods } from "../../billing/dto/billing.dto";

// Способ выплаты — тот же справочник, что у оплат учеников (paymentMethods),
// поэтому переиспользуется, а не дублируется здесь.

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalidMonth");
const money = z.number().int("amountInteger").max(1_000_000_000, "amountTooLarge");

export const salaryOverviewQuerySchema = z.object({
  month: monthString.optional(),
  branchId: z.string().max(40).optional(),
});

export const teacherSalaryQuerySchema = z.object({
  month: monthString.optional(),
});

export const setManualAmountSchema = z.object({
  // null — снять ручную фиксацию, вернуться к формуле
  manualAmount: money.min(0, "amountPositive").nullable(),
});

export const recalcQuerySchema = z.object({
  month: monthString,
  // Пусто — пересчитать начисление по записям курса без группы
  groupId: z.string().max(40).optional(),
  // Для записей без группы — какой из курсов педагога пересчитать: их
  // может быть несколько
  courseId: z.string().max(40).optional(),
});

export const groupStudentsQuerySchema = z
  .object({
    month: monthString,
    groupId: z.string().max(40).optional(),
    // Для курса без группы — groupId пуст, courseId обязателен
    courseId: z.string().max(40).optional(),
  })
  .refine((query) => Boolean(query.groupId || query.courseId), { message: "courseRequired", path: ["courseId"] });

export const payoutFiltersSchema = z.object({
  month: monthString.optional(),
  teacherId: z.string().max(40).optional(),
  branchId: z.string().max(40).optional(),
});

export const createPayoutSchema = z.object({
  teacherId: z.string().min(1, "teacherRequired").max(40),
  amount: money.positive("amountPositive"),
  method: z.enum(paymentMethods),
  paidAt: dateString,
  forMonth: monthString.optional(),
  comment: z.string().max(500, "maxChars500").optional(),
});

export class SalaryOverviewQueryDto extends createZodDto(salaryOverviewQuerySchema) {}
export class TeacherSalaryQueryDto extends createZodDto(teacherSalaryQuerySchema) {}
export class SetManualAmountDto extends createZodDto(setManualAmountSchema) {}
export class RecalcQueryDto extends createZodDto(recalcQuerySchema) {}
export class GroupStudentsQueryDto extends createZodDto(groupStudentsQuerySchema) {}
export class PayoutFiltersDto extends createZodDto(payoutFiltersSchema) {}
export class CreatePayoutDto extends createZodDto(createPayoutSchema) {}
