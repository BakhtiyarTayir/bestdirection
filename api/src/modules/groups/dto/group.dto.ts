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

// Цена группы обязательна: цена курса в начислениях не участвует (решение
// владельца 2026-09-23), и группа без цены означала бы бесплатное обучение.
// Пустая строка приводится к нулю и отклоняется — «снять цену» больше нельзя.
const price = z.coerce.number().int().positive("pricePositive").max(1_000_000_000, "amountTooLarge");

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

// Дни занятий по ISO (1 = пн … 7 = вс). Обязательны при создании (план
// «Уроки и карточка группы», этап 1): от них зависит и пропорция начисления
// за неполный месяц (chargeForMonth, basis "lessons"), и — с этапа 3 —
// знаменатель в расчёте зарплаты. Пустой массив раньше означал «расписание
// не задано» и обе механики скатывались на грубые приближения; на момент
// решения все 14 активных групп уже были заполнены, переносить нечего.
const scheduleDaysField = z.array(z.number().int().min(1).max(7)).max(7);

const groupFields = {
  description: z.string().max(500, "maxChars500").optional(),
  schedule: z.string().max(200, "maxChars200").optional(),
  // Пустая строка из <select> — «взять преподавателя курса»
  teacherId: z.string().max(40).optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
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
  scheduleDays: scheduleDaysField.min(1, "scheduleDaysRequired"),
  price,
  ...groupFields,
});

export const updateGroupSchema = z.object({
  name: z.string().min(1, "groupNameRequired").max(100, "maxChars100").optional(),
  branchId: z.string().min(1, "branchRequired").max(40).optional(),
  // Необязателен при частичном обновлении: иначе любой PATCH группы, не
  // трогающий расписание (смена цены, преподавателя, включение/выключение…),
  // сломался бы, потребовав прислать дни заново (ловушка из плана, раздел 2).
  // Но если поле всё же передано — пустым оно быть не должно: иначе PATCH
  // мог бы тем же движением, что и create, снять уже заданное расписание.
  scheduleDays: scheduleDaysField.min(1, "scheduleDaysRequired").optional(),
  price: price.optional(),
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
