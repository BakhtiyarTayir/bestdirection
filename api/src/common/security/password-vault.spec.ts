import { beforeAll, describe, expect, it } from "vitest";
import { generatePassword, openPassword, sealPassword } from "./password-vault";

describe("password-vault", () => {
  beforeAll(() => {
    process.env.INTERNAL_TOKEN = "test-internal-token-0123456789abcdef";
  });

  it("круговой путь возвращает исходный пароль", () => {
    const enc = sealPassword("Пароль-123 xyz");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("xyz");
    expect(openPassword(enc)).toBe("Пароль-123 xyz");
  });

  it("один пароль шифруется по-разному (случайный iv)", () => {
    expect(sealPassword("abcdefgh")).not.toBe(sealPassword("abcdefgh"));
  });

  it("подмена байта шифртекста или тега даёт null", () => {
    const parts = sealPassword("abcdefgh").split(":");
    for (const index of [2, 3]) {
      const bytes = Buffer.from(parts[index], "base64");
      bytes[0] ^= 1;
      const tampered = [...parts];
      tampered[index] = bytes.toString("base64");
      expect(openPassword(tampered.join(":"))).toBeNull();
    }
  });

  it("мусор, пустое значение и чужая версия — null", () => {
    expect(openPassword(null)).toBeNull();
    expect(openPassword("")).toBeNull();
    expect(openPassword("мусор")).toBeNull();
    expect(openPassword(sealPassword("abcdefgh").replace("v1:", "v2:"))).toBeNull();
  });

  it("сменённый ключ — null, а не исключение", () => {
    const enc = sealPassword("abcdefgh");
    process.env.INTERNAL_TOKEN = "another-internal-token-0123456789abcdef";
    try {
      expect(openPassword(enc)).toBeNull();
    } finally {
      process.env.INTERNAL_TOKEN = "test-internal-token-0123456789abcdef";
    }
  });

  it("генератор: 8 символов без похожих, пароли разные", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const password = generatePassword();
      expect(password).toMatch(/^[a-zA-Z2-9]{8}$/);
      expect(password).not.toMatch(/[0OlI1]/);
      seen.add(password);
    }
    expect(seen.size).toBeGreaterThan(190);
  });
});
