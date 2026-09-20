import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const password = z.string().min(8, "passwordTooShort").max(200);
const code = z.string().regex(/^\d{6}$/, "invalidCode");

// Формат логина здесь не проверяется строгим регэкспом (LOGIN_REGEX из
// login-generator живёт в DTO создания/правки пользователя) — попытка входа
// с неверным форматом просто не найдёт совпадения в базе.
const loginIdentifier = z.string().trim().toLowerCase().min(1, "loginRequired").max(200);

export const loginSchema = z.object({ login: loginIdentifier, password });

export const requestTelegramPasswordResetSchema = z.object({ login: loginIdentifier });

export const resetPasswordViaTelegramSchema = z.object({
  login: loginIdentifier,
  code,
  newPassword: password,
});

/** Поля виджета Telegram приходят как есть: по ним считается подпись. */
export const telegramWidgetSchema = z.object({
  id: z.string().min(1).max(40),
  first_name: z.string().max(200).optional(),
  last_name: z.string().max(200).optional(),
  username: z.string().max(200).optional(),
  photo_url: z.string().max(500).optional(),
  auth_date: z.string().max(40),
  hash: z.string().min(1).max(200),
});

export const telegramCodeSchema = z.object({ code: z.string().regex(/^[0-9a-f]{32}$/) });

export class LoginDto extends createZodDto(loginSchema) {}
export class TelegramWidgetDto extends createZodDto(telegramWidgetSchema) {}
export class TelegramCodeDto extends createZodDto(telegramCodeSchema) {}
export class RequestTelegramPasswordResetDto extends createZodDto(requestTelegramPasswordResetSchema) {}
export class ResetPasswordViaTelegramDto extends createZodDto(resetPasswordViaTelegramSchema) {}
