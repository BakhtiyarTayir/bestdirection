import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const email = z.string().trim().email().max(200);
const password = z.string().min(8, "passwordTooShort").max(200);
const code = z.string().regex(/^\d{6}$/, "invalidCode");

// Одно поле принимает и логин, и почту (шаг 1 отказа от почты,
// PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1) — формат логина здесь
// НЕ проверяется регэкспом: значение может быть старой почтой. Кто из двух
// это на самом деле, решает AuthService.loginWithPassword запросом OR.
const loginIdentifier = z.string().trim().toLowerCase().min(1, "loginRequired").max(200);

export const loginSchema = z.object({ login: loginIdentifier, password });

export const requestTelegramPasswordResetSchema = z.object({ login: loginIdentifier });

export const resetPasswordViaTelegramSchema = z.object({
  login: loginIdentifier,
  code,
  newPassword: password,
});

export const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email,
  password,
  code,
});

export const requestEmailSchema = z.object({
  email,
  locale: z.enum(["ru", "uz"]).optional(),
});

export const verifyCodeSchema = z.object({ email, code });

export const resetPasswordSchema = z.object({ email, code, newPassword: password });

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
export class RegisterDto extends createZodDto(registerSchema) {}
export class RequestEmailDto extends createZodDto(requestEmailSchema) {}
export class VerifyCodeDto extends createZodDto(verifyCodeSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class TelegramWidgetDto extends createZodDto(telegramWidgetSchema) {}
export class TelegramCodeDto extends createZodDto(telegramCodeSchema) {}
export class RequestTelegramPasswordResetDto extends createZodDto(requestTelegramPasswordResetSchema) {}
export class ResetPasswordViaTelegramDto extends createZodDto(resetPasswordViaTelegramSchema) {}
