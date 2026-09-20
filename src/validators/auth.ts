import { z } from "zod";

// Почта убрана целиком (шаг 2 отказа от почты) — логин единственный
// опознавательный знак при входе
export const loginSchema = z.object({
  login: z.string().trim().min(1, "loginRequired"),
  password: z
    .string()
    .min(8, "passwordMinLength"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Единственный самостоятельный путь сброса пароля — по логину, код в Telegram
export const telegramResetRequestSchema = z.object({
  login: z.string().trim().min(1, "loginRequired"),
});
export type TelegramResetRequestInput = z.infer<typeof telegramResetRequestSchema>;
