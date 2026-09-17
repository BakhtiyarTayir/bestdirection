import { createHash, timingSafeEqual } from "node:crypto";

/** Сравнение секрета за постоянное время: по хэшам, чтобы длины совпадали. */
export function isValidInternalToken(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || received.length === 0) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
