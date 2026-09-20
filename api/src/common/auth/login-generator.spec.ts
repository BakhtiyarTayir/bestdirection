import { describe, expect, it } from "vitest";
import { generateUniqueLogin, loginBaseFromEmail, loginBaseFromName, LOGIN_REGEX } from "./login-generator";

/** Заглушка prismaUnscoped: занятыми считаются перечисленные логины. */
const prismaWith = (takenLogins: string[]) => ({
  user: {
    findUnique: async ({ where }: { where: { login: string } }) =>
      takenLogins.includes(where.login) ? { id: "x" } : null,
  },
}) as never;

describe("генератор логинов", () => {
  it("свободную базу отдаёт как есть", async () => {
    expect(await generateUniqueLogin(prismaWith([]), "ivan.ivanov")).toBe("ivan.ivanov");
  });

  it("занятую базу разводит числовым суффиксом", async () => {
    expect(await generateUniqueLogin(prismaWith(["ivan.ivanov", "ivan.ivanov2"]), "ivan.ivanov")).toBe(
      "ivan.ivanov3"
    );
  });

  // База длиной ровно в предел: раньше `${base}${suffix}`.slice(0, 30) возвращал
  // саму базу, кандидат не менялся и цикл крутился вечно — контейнер api,
  // вызывающий это при старте (backfill), не поднимался бы вовсе.
  it("не зацикливается на базе предельной длины", async () => {
    const base = "a".repeat(30);
    const login = await generateUniqueLogin(prismaWith([base]), base);
    expect(login).not.toBe(base);
    expect(login.length).toBeLessThanOrEqual(30);
    expect(login).toMatch(LOGIN_REGEX);
  });

  // 29 символов + двузначный суффикс давали один и тот же кандидат на каждой
  // итерации — то же зависание, только на десятом однофамильце
  it("не зацикливается, когда суффикс становится двузначным", async () => {
    const base = "b".repeat(29);
    const taken = [base, ...Array.from({ length: 30 }, (_, i) => `${base.slice(0, 30 - String(i + 2).length)}${i + 2}`)];
    const login = await generateUniqueLogin(prismaWith(taken), base);
    expect(taken).not.toContain(login);
    expect(login.length).toBeLessThanOrEqual(30);
  });

  it("из почты берёт локальную часть, из имени — транслитерацию", async () => {
    expect(loginBaseFromEmail("Ivan.Ivanov@gmail.com")).toBe("ivan.ivanov");
    expect(loginBaseFromEmail("ab@gmail.com")).toBeNull();
    expect(loginBaseFromName("Иван", "Иванов")).toBe("ivan.ivanov");
  });

  it("короткое имя добирается до минимальной длины", () => {
    const login = loginBaseFromName("О", "У");
    expect(login.length).toBeGreaterThanOrEqual(3);
    expect(login).toMatch(LOGIN_REGEX);
  });
});
