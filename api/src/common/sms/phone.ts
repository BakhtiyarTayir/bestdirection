/**
 * Нормализация телефонов под формат Eskiz: 998XXXXXXXXX, двенадцать цифр
 * без плюса, скобок и пробелов. Шлюз другого формата не принимает.
 */

const UZ_CODE = "998";
const NATIONAL_LENGTH = 9; // без кода страны: 90 123 45 67

/**
 * Приводит номер к виду 998XXXXXXXXX либо возвращает null, если это не
 * похоже на узбекский мобильный. null — сигнал не отправлять: молчаливая
 * отправка на кривой номер списала бы деньги впустую.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const digits = input.replace(/\D/g, "");
  if (!digits) return null;

  // 998901234567 — уже полный
  if (digits.length === UZ_CODE.length + NATIONAL_LENGTH && digits.startsWith(UZ_CODE)) {
    return digits;
  }

  // 901234567 — без кода страны
  if (digits.length === NATIONAL_LENGTH) {
    return UZ_CODE + digits;
  }

  // 8901234567 — с внутренней «восьмёркой»
  if (digits.length === NATIONAL_LENGTH + 1 && digits.startsWith("8")) {
    return UZ_CODE + digits.slice(1);
  }

  return null;
}

/** Читаемый вид для интерфейса: +998 90 123 45 67 */
export function formatPhone(input: string | null | undefined): string {
  const normalized = normalizePhone(input);
  if (!normalized) return input?.trim() || "";
  const n = normalized.slice(UZ_CODE.length);
  return `+${UZ_CODE} ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}

/**
 * Число частей СМС. Латиница помещается в 160 символов на часть,
 * кириллица — в 70: у неё другая кодировка. Разница в цене кратная,
 * поэтому считать надо до отправки, а не после.
 */
export function countSmsParts(text: string): { parts: number; unicode: boolean } {
  // GSM-03.38 приблизительно: латиница, цифры и обычная пунктуация
  const unicode = /[^\x20-\x7E\n\r]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153; // в составном сообщении часть занимает заголовок

  if (text.length === 0) return { parts: 0, unicode };
  if (text.length <= single) return { parts: 1, unicode };
  return { parts: Math.ceil(text.length / multi), unicode };
}
