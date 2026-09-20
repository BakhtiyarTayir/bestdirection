import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { LOGIN_REGEX } from "../../../common/auth/login-generator";

// Схемы перенесены из src/validators/user.ts в web: там они импортировались
// только как типы и на сервере не выполнялись (аудит 1.3). Здесь их выполняет
// глобальный ZodValidationPipe. Ограничения длины добавлены: у строк их не было
// вовсе (аудит 4.7).

export const roleSchema = z.enum(["ADMIN", "TEACHER", "STUDENT", "PARENT"]);

const nameSchema = z.string().trim().min(1).max(100);
const phoneSchema = z.string().trim().max(30).optional();
const passwordSchema = z.string().min(8, "passwordMinLength").max(200);
// trim+toLowerCase здесь, а не в сервисе: иначе «Ivanov » и «ivanov» завели бы
// двух разных людей (ловушка 1, PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1)
const loginSchema = z.string().trim().toLowerCase().regex(LOGIN_REGEX, "loginInvalid");

// Приписка справочная (настоящая привязка — через группу, см. ловушку 3.8.5
// плана филиалов), поэтому необязательна в базе. В форме СОЗДАНИЯ она уже
// обязательна (4.3) — колонка при этом остаётся необязательной: пользователя
// заводит ещё и вход через Telegram, где филиала неоткуда взять.
const branchIdSchema = z.string().max(40).optional();

// Блок «Обучение» в форме создания ученика (4.4–4.6): курс обязателен, если
// блок вообще заполнен, остальное — необязательные уточнения цены и даты.
const enrollmentSchema = z.object({
  courseId: z.string().min(1, "courseRequired").max(40),
  groupId: z.string().max(40).optional(),
  // Личная цена ученика — перебивает цену группы навсегда (ловушка 3).
  // Пусто = «как у группы».
  priceOverride: z.number().int().positive("amountPositive").max(1_000_000_000).optional(),
  // Календарная дата строкой: Date уехал бы на сутки при UTC-сериализации (ловушка 2)
  startsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate")
    .optional(),
  firstMonthCharge: z.number().int().min(0).max(1_000_000_000).optional(),
});

export const createUserSchema = z
  .object({
    login: loginSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneSchema,
    role: roleSchema,
    branchId: z.string().min(1, "branchRequired").max(40),
    // Разрешён только для роли STUDENT — проверяется здесь, а не в сервисе:
    // ошибка должна прийти как обычный 400 с указанием поля (ловушка 4)
    enrollment: enrollmentSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.enrollment && data.role !== "STUDENT") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enrollmentOnlyForStudents",
        path: ["enrollment"],
      });
    }
  });

// Ставка зарплаты преподавателя в базисных пунктах (4000 = 40.00%), как у
// группы (groups/dto/group.dto.ts) — пусто снимает ставку, а не 0%
// (план зарплат, 5.2). nullable: явный null из формы означает «очистить».
const salaryPercentBpSchema = z
  .number()
  .int("percentPositive")
  .min(0, "percentPositive")
  .max(10_000, "percentTooLarge")
  .nullable()
  .optional();

export const updateUserSchema = z.object({
  login: loginSchema.optional(),
  // Сброс пароля администратором (4.1, «Путь 1»): поле есть только здесь,
  // не в профиле — сменить чужой пароль может только ADMIN через PATCH.
  password: passwordSchema.optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema,
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  branchId: branchIdSchema,
  salaryPercentBp: salaryPercentBpSchema,
});

export const usersQuerySchema = z.object({ branchId: z.string().max(40).optional() });

export const loginSuggestionSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
});

export const loginAvailableQuerySchema = z.object({
  login: z.string().trim().toLowerCase().max(30),
});

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
export class LoginSuggestionDto extends createZodDto(loginSuggestionSchema) {}
export class LoginAvailableQueryDto extends createZodDto(loginAvailableQuerySchema) {}
