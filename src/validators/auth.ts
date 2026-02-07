import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email обязателен")
    .email("Некорректный email адрес"),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов"),
});

export type LoginInput = z.infer<typeof loginSchema>;
