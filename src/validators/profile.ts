import { z } from "zod";

export const profileSchema = z.object({
  firstName: z.string().min(1, "Имя обязательно"),
  lastName: z.string().min(1, "Фамилия обязательна"),
  phone: z.string().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

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
