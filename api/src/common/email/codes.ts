import { createHash } from "node:crypto";

// Коды подтверждения почты. Перенесено из src/lib/email-codes.ts в web.
export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

/** В базе лежит хэш: код видит только получатель письма. */
export function hashVerificationCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}
