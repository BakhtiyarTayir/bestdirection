import { z } from "zod";

export const RoleEnum = z.enum(["ADMIN", "TEACHER", "STUDENT", "PARENT"]);
export type Role = z.infer<typeof RoleEnum>;

const roleEnum = RoleEnum;

// Формат совпадает с api/src/modules/users/dto/user.dto.ts (LOGIN_REGEX) —
// один источник правды для клиентской и серверной проверки
const LOGIN_REGEX = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const loginSchema = z.string().trim().toLowerCase().regex(LOGIN_REGEX, "loginInvalid");

// Числовые и date-поля приходят из HTML-инпутов строками; пустая строка
// значит «не задано», а не 0 — Number("") дал бы 0 и завалил бы .positive()
// на пустом, намеренно оставленном поле
const optionalPositiveMoney = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : Number(value)),
  z.number().int().positive("amountPositive").optional()
);
const optionalNonNegativeMoney = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : Number(value)),
  z.number().int().min(0, "amountPositive").optional()
);
const optionalDateString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

// Блок «Обучение» в форме создания ученика (4.4) — курс обязателен, если
// блок вообще заполнен, остальное уточняет цену и дату начала
const enrollmentSchema = z.object({
  courseId: z.string().min(1, "courseRequired"),
  groupId: z.string().optional(),
  priceOverride: optionalPositiveMoney,
  startsAt: optionalDateString,
  firstMonthCharge: optionalNonNegativeMoney,
});
export type EnrollmentInput = z.infer<typeof enrollmentSchema>;

export const createUserSchema = z
  .object({
    login: loginSchema,
    password: z
      .string()
      .min(8, "passwordMinLength"),
    firstName: z
      .string()
      .min(1, "firstNameRequired"),
    lastName: z
      .string()
      .min(1, "lastNameRequired"),
    phone: z
      .string()
      .optional(),
    role: roleEnum,
    // Обязателен в форме создания (4.3) — сужает список групп в блоке
    // «Обучение» и решает, у кого какой филиал в списках
    branchId: z.string().min(1, "branchRequired"),
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

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1, "userIdRequired"),
  email: z
    .union([z.string().email("emailInvalid"), z.literal("")])
    .optional(),
  login: loginSchema.optional(),
  // Сброс пароля администратором (4.1, «Путь 1») — пусто = не менять
  password: z
    .union([z.string().min(8, "passwordMinLength"), z.literal("")])
    .optional(),
  firstName: z
    .string()
    .min(1, "firstNameRequired")
    .optional(),
  lastName: z
    .string()
    .min(1, "lastNameRequired")
    .optional(),
  phone: z
    .string()
    .optional(),
  role: roleEnum.optional(),
  branchId: z
    .string()
    .optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "currentPasswordRequired"),
  newPassword: z
    .string()
    .min(8, "newPasswordMinLength"),
  confirmPassword: z
    .string()
    .min(1, "confirmPasswordRequired"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "passwordMismatch",
  path: ["confirmPassword"],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
