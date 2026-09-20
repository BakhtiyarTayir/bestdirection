import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// Схемы перенесены из src/validators/group.ts в web.

/**
 * Календарная дата строкой "YYYY-MM-DD", а не Date: Date по дороге на сервер
 * сериализуется в момент времени, и выбранная полночь по локали админа (UTC+5)
 * пришла бы как 19:00 предыдущих суток — дата уехала бы на день назад.
 * Пустая строка означает «очистить поле».
 */
const dateOnly = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"), z.literal("")]);

// Пустая строка — цены у группы нет, берётся цена курса. Ноль не допускаем:
// иначе пустое поле, приведённое к числу, тихо сделало бы месяц бесплатным.
const price = z.union([
  z.coerce.number().int().positive("pricePositive").max(1_000_000_000, "amountTooLarge"),
  z.literal(""),
]);

// Ставка зарплаты группы в базисных пунктах (4000 = 40.00%). В форме процент
// вводится с одним знаком после запятой, поэтому шаг — десятые доли процента,
// то есть кратно 10 б.п.; пустая строка — ставки у группы нет, берётся ставка
// преподавателя (план зарплат, 5.2).
const salaryPercentBp = z.union([
  // 10000 б.п. = 100%: доля преподавателя от начислений группы больше
  // полной суммы не бывает
  z.coerce.number().int().min(0, "percentPositive").max(10_000, "percentTooLarge"),
  z.literal(""),
]);

const groupFields = {
  description: z.string().max(500, "maxChars500").optional(),
  schedule: z.string().max(200, "maxChars200").optional(),
  // Дни занятий по ISO (1 = пн … 7 = вс). Пустой массив допустим: тогда
  // неполный месяц начисляется по дням, а не по занятиям
  scheduleDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  // Пустая строка из <select> — «взять преподавателя курса»
  teacherId: z.string().max(40).optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  price: price.optional(),
  salaryPercentBp: salaryPercentBp.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
};

export const createGroupSchema = z.object({
  courseId: z.string().min(1, "courseRequired").max(40),
  name: z.string().min(1, "groupNameRequired").max(100, "maxChars100"),
  // Обязателен: группа всегда занимается в конкретном филиале (решение
  // владельца 2026-09-20). Имя группы уникально внутри (courseId, branchId).
  branchId: z.string().min(1, "branchRequired").max(40),
  ...groupFields,
});

export const updateGroupSchema = z.object({
  name: z.string().min(1, "groupNameRequired").max(100, "maxChars100").optional(),
  branchId: z.string().min(1, "branchRequired").max(40).optional(),
  ...groupFields,
});

export const addStudentsSchema = z.object({
  studentIds: z.array(z.string().max(40)).min(1).max(200),
});

export const moveStudentSchema = z.object({
  studentId: z.string().min(1).max(40),
  courseId: z.string().min(1).max(40),
});

export const courseIdQuerySchema = z.object({ courseId: z.string().min(1).max(40) });
export const groupsQuerySchema = z.object({ branchId: z.string().max(40).optional() });
export const removeStudentQuerySchema = z.object({
  // true — отчислить с курса совсем, иначе только убрать из группы
  alsoUnenroll: z.coerce.boolean().default(false),
});

export class CreateGroupDto extends createZodDto(createGroupSchema) {}
export class UpdateGroupDto extends createZodDto(updateGroupSchema) {}
export class AddStudentsDto extends createZodDto(addStudentsSchema) {}
export class MoveStudentDto extends createZodDto(moveStudentSchema) {}
export class CourseIdQueryDto extends createZodDto(courseIdQuerySchema) {}
export class GroupsQueryDto extends createZodDto(groupsQuerySchema) {}
export class RemoveStudentQueryDto extends createZodDto(removeStudentQuerySchema) {}
