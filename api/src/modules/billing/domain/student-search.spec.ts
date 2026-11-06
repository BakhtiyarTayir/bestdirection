import { describe, expect, it } from "vitest";
import { matchesStudentSearch, searchWords } from "./student-search";

const student = { firstName: "Muhammad", lastName: "Ibragimov", phone: "+998901234567" };

describe("поиск ученика", () => {
  it("пустая строка и пробелы — фильтра нет", () => {
    expect(searchWords("   ")).toEqual([]);
    expect(matchesStudentSearch(student, "  ")).toBe(true);
    expect(matchesStudentSearch(student, undefined)).toBe(true);
  });

  it("подстрока без учёта регистра по имени, фамилии и телефону", () => {
    expect(matchesStudentSearch(student, "IBRAG")).toBe(true);
    expect(matchesStudentSearch(student, "hamm")).toBe(true);
    expect(matchesStudentSearch(student, "90123")).toBe(true);
    expect(matchesStudentSearch(student, "petrov")).toBe(false);
  });

  it("два слова в любом порядке: AND по словам", () => {
    expect(matchesStudentSearch(student, "Ibragimov Muhammad")).toBe(true);
    expect(matchesStudentSearch(student, "Muhammad Ibragimov")).toBe(true);
    expect(matchesStudentSearch(student, "Muhammad Petrov")).toBe(false);
  });

  it("кириллица и ученик без телефона", () => {
    const ru = { firstName: "Мухаммад", lastName: "Ибрагимов", phone: null };
    expect(matchesStudentSearch(ru, "ибраг мух")).toBe(true);
    expect(matchesStudentSearch(ru, "998")).toBe(false);
  });
});
