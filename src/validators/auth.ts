import { z } from "zod";

// Принимает и логин, и почту (шаг 1 отказа от почты) — формат не проверяем
// строго здесь: значение может быть старой почтой или новым логином, разбор
// того, что перед ним, делает сервер
export const loginSchema = z.object({
  login: z.string().trim().min(1, "loginRequired"),
  password: z
    .string()
    .min(8, "passwordMinLength"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Второй путь сброса пароля — по логину, код в Telegram
export const telegramResetRequestSchema = z.object({
  login: z.string().trim().min(1, "loginRequired"),
});
export type TelegramResetRequestInput = z.infer<typeof telegramResetRequestSchema>;

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "firstNameRequired"),
    lastName: z.string().min(1, "lastNameRequired"),
    email: z
      .string()
      .min(1, "emailRequired")
      .email("emailInvalid"),
    password: z
      .string()
      .min(8, "passwordMinLength"),
    confirmPassword: z.string().min(1, "confirmPasswordRequired"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// Шаг «остальные поля» при регистрации: email уже подтверждён кодом
export const registerDetailsSchema = z
  .object({
    firstName: z.string().min(1, "firstNameRequired"),
    lastName: z.string().min(1, "lastNameRequired"),
    password: z
      .string()
      .min(8, "passwordMinLength"),
    confirmPassword: z.string().min(1, "confirmPasswordRequired"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type RegisterDetailsInput = z.infer<typeof registerDetailsSchema>;
