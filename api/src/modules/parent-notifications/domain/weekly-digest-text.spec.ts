import { describe, expect, it } from "vitest";
import { buildWeeklyDigestText, type DigestInput } from "./weekly-digest-text";

function baseInput(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    studentName: "Азиз Каримов",
    weekFromDdMm: "21.09",
    weekToDdMm: "27.09",
    attendanceTotal: 0,
    attendanceAbsent: 0,
    homework: [],
    tests: [],
    debtAmount: 0,
    debtAmountFormatted: "0 UZS",
    ...overrides,
  };
}

describe("buildWeeklyDigestText", () => {
  it("шапка всегда содержит имя ученика и границы недели", () => {
    const text = buildWeeklyDigestText(baseInput());
    expect(text).toContain("Азиз Каримов");
    expect(text).toContain("21.09");
    expect(text).toContain("27.09");
  });

  it("пустая неделя — явно про отсутствие занятий, заданий и тестов, а не молчание", () => {
    const text = buildWeeklyDigestText(baseInput());
    expect(text).toContain("bo'lmadi");
    expect(text).toContain("Bu hafta tekshirilgan vazifa yo'q");
    expect(text).toContain("Bu hafta test topshirilmagan");
  });

  it("посещаемость: занятий и пропусков", () => {
    const text = buildWeeklyDigestText(baseInput({ attendanceTotal: 4, attendanceAbsent: 1 }));
    expect(text).toContain("4");
    expect(text).toContain("1");
  });

  it("проверенные задания — строкой на каждое, со статусом и оценкой", () => {
    const text = buildWeeklyDigestText(
      baseInput({
        homework: [
          { title: "Циклы", status: "APPROVED", score: "90/100" },
          { title: "Функции", status: "REVISION", score: null },
        ],
      })
    );
    expect(text).toContain("Циклы");
    expect(text).toContain("90/100");
    expect(text).toContain("Функции");
    expect(text).not.toContain("Bu hafta tekshirilgan vazifa yo'q");
  });

  it("пройденные тесты — строкой на каждый с процентом", () => {
    const text = buildWeeklyDigestText({
      ...baseInput(),
      tests: [{ title: "Тест по циклам", percentage: 83 }],
    });
    expect(text).toContain("Тест по циклам");
    expect(text).toContain("83%");
  });

  it("долг: показан, если положительный", () => {
    const text = buildWeeklyDigestText(baseInput({ debtAmount: 150_000, debtAmountFormatted: "150 000 UZS" }));
    expect(text).toContain("150 000 UZS");
  });

  it("долг: строки нет, если долга нет", () => {
    const text = buildWeeklyDigestText(baseInput({ debtAmount: 0 }));
    expect(text).not.toContain("Qarzdorlik");
  });
});
