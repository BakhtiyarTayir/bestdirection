import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// Схемы перенесены из src/validators/user.ts в web: там они импортировались
// только как типы и на сервере не выполнялись (аудит 1.3). Здесь их выполняет
// глобальный ZodValidationPipe. Ограничения длины добавлены: у строк их не было
// вовсе (аудит 4.7).

export const roleSchema = z.enum(["ADMIN", "TEACHER", "STUDENT", "PARENT"]);

const emailSchema = z
  .union([z.string().trim().email("emailInvalid").max(200), z.literal("")])
  .optional();
const nameSchema = z.string().trim().min(1).max(100);
const phoneSchema = z.string().trim().max(30).optional();
const passwordSchema = z.string().min(8, "passwordMinLength").max(200);

// Приписка справочная (настоящая привязка — через группу, см. ловушку 3.8.5
// плана филиалов), поэтому необязательна и в форме, и в колонке базы.
const branchIdSchema = z.string().max(40).optional();

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  role: roleSchema,
  branchId: branchIdSchema,
});

export const updateUserSchema = z.object({
  email: emailSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema,
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  branchId: branchIdSchema,
});

export const usersQuerySchema = z.object({ branchId: z.string().max(40).optional() });

export const updateProfileSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200),
  newPassword: passwordSchema,
});

export const homeworkStatisticsQuerySchema = z.object({
  courseId: z.string().max(40).optional(),
  homeworkId: z.string().max(40).optional(),
  groupId: z.string().max(40).optional(),
  submissionState: z.enum(["ALL", "PASSED", "FAILED", "NOT_SUBMITTED"]).optional(),
  // Имена сортируются по алфавиту языка интерфейса: узбекский ставит Oʻ и Gʻ
  // после Z, русский — кириллицу перед латиницей
  locale: z.enum(["uz", "ru"]).default("uz"),
});

export class CreateUserDto extends createZodDto(createUserSchema) {}
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
export class UsersQueryDto extends createZodDto(usersQuerySchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class HomeworkStatisticsQueryDto extends createZodDto(homeworkStatisticsQuerySchema) {}
