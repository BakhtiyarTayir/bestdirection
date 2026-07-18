import { createHash } from "crypto";

export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export function hashVerificationCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}
