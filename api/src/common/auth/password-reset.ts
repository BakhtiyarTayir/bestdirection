import { createHash } from "node:crypto";

/**
 * Сброс пароля через Telegram (PasswordResetRequest) — второй, независимый от
 * почты путь восстановления доступа (см. PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md,
 * 4.1). Константы отдельные от api/src/common/email/codes.ts: тот файл уходит
 * целиком на шаге 2, а этот путь должен пережить удаление почты.
 */
export const RESET_CODE_TTL_MS = 15 * 60 * 1000;
export const RESET_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const RESET_CODE_MAX_ATTEMPTS = 5;

/** В базе лежит хэш: код видит только владелец Telegram-чата. */
export function hashResetCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}
