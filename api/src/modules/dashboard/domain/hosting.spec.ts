import { describe, expect, it } from "vitest";
import { hostingDaysLeft } from "./hosting";

describe("hostingDaysLeft", () => {
  it("считает целые дни до даты оплаты", () => {
    expect(hostingDaysLeft("2026-11-06", "2026-10-27")).toBe(10);
    expect(hostingDaysLeft("2026-11-06", "2026-11-05")).toBe(1);
  });

  it("0 в последний день и минус после", () => {
    expect(hostingDaysLeft("2026-11-06", "2026-11-06")).toBe(0);
    expect(hostingDaysLeft("2026-11-06", "2026-11-08")).toBe(-2);
  });

  it("переход через месяц и год", () => {
    expect(hostingDaysLeft("2027-01-06", "2026-12-27")).toBe(10);
  });
});
