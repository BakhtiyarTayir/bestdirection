// Тот же алфавит, что у сервера (api password-vault): без 0/O, 1/l/I.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Пароль из 8 символов для кнопки «Сгенерировать»; случайность — crypto браузера. */
export function generateClientPassword(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join("");
}
