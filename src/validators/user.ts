import { z } from "zod";

export const RoleEnum = z.enum(["ADMIN", "TEACHER", "STUDENT"]);
export type Role = z.infer<typeof RoleEnum>;

const roleEnum = RoleEnum;

export const createUserSchema = z.object({
  email: z
    .string()
    .min(1, "Email обязателен")
    .email("Некорректный email адрес"),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов"),
  firstName: z
    .string()
    .min(1, "Имя обязательно"),
  lastName: z
    .string()
    .min(1, "Фамилия обязательна"),
  phone: z
    .string()
    .optional(),
  role: roleEnum,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1, "ID пользователя обязателен"),
  email: z
    .string()
    .email("Некорректный email адрес")
    .optional(),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов")
    .optional(),
  firstName: z
    .string()
    .min(1, "Имя обязательно")
    .optional(),
  lastName: z
    .string()
    .min(1, "Фамилия обязательна")
    .optional(),
  phone: z
    .string()
    .optional(),
  role: roleEnum.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Текущий пароль обязателен"),
  newPassword: z
    .string()
    .min(8, "Новый пароль должен содержать минимум 8 символов"),
  confirmPassword: z
    .string()
    .min(1, "Подтверждение пароля обязательно"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
