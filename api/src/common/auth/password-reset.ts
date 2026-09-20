import { createHash } from "node:crypto";

/**
 * Сброс пароля через Telegram (PasswordResetRequest) — единственный
 * самостоятельный путь восстановления доступа после ухода почты
 * (см. PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1).
 */
export const RESET_CODE_TTL_MS = 15 * 60 * 1000;
export const RESET_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const RESET_CODE_MAX_ATTEMPTS = 5;

/** В базе лежит хэш: код видит только владелец Telegram-чата. */
export function hashResetCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}
