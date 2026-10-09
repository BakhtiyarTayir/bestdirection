import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt } from "node:crypto";

// Обратимое хранение пароля ученика, чтобы администратор мог передать доступ
// (PLAN-STUDENT-PASSWORDS-2026-10-09.md). Решение владельца: администратор
// видит пароли учеников. Ключ выводится из INTERNAL_TOKEN (тот же приём, что
// секрет в sms.service.ts) — отдельной переменной окружения не нужно, а
// утечка одной только базы пароли не раскрывает.

const VERSION = "v1";
const INFO = "student-password-view";

// Без похожих символов: 0/O, 1/l/I
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function key(): Buffer {
  const secret = process.env.INTERNAL_TOKEN ?? "";
  return Buffer.from(hkdfSync("sha256", secret, "", INFO, 32));
}

/** `v1:<iv>:<tag>:<ciphertext>` (base64), AES-256-GCM. */
export function sealPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(":");
}

/** Пароль или null: битые данные и сменённый ключ — не исключение. */
export function openPassword(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    const [version, iv, tag, body, ...rest] = enc.split(":");
    if (version !== VERSION || !iv || !tag || !body || rest.length > 0) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Случайный пароль из 8 символов (буквы и цифры без похожих). */
export function generatePassword(length = 8): string {
  let result = "";
  for (let i = 0; i < length; i += 1) result += ALPHABET[randomInt(ALPHABET.length)];
  return result;
}
