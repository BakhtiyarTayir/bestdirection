import { describe, expect, it } from "vitest";
import {
  computeAccrual,
  computeFormulaAmount,
  isClosedMonth,
  mergeAccrualMonths,
  payoutMonth,
  resolveSalaryPercentBp,
  totalAccrued,
  type AccrualComputationInput,
  type StoredAccrual,
} from "./salary";

describe("resolveSalaryPercentBp — приоритет ставки", () => {
  it("ставка группы важнее ставки преподавателя", () => {
    expect(resolveSalaryPercentBp({ groupPercentBp: 3000, teacherPercentBp: 4000 })).toBe(3000);
  });

  it("нет ставки у группы — берётся ставка преподавателя", () => {
    expect(resolveSalaryPercentBp({ groupPercentBp: null, teacherPercentBp: 4000 })).toBe(4000);
  });

  it("ставки нет нигде — null, а не 0", () => {
    expect(resolveSalaryPercentBp({ groupPercentBp: null, teacherPercentBp: null })).toBeNull();
  });
});

describe("computeFormulaAmount — округление", () => {
  it("40% от 650000 = 260000", () => {
    expect(computeFormulaAmount(650_000, 4000)).toBe(260_000);
  });

  it("округляет до целого сума (33.33% от 100 = 33.33 → 33)", () => {
    expect(computeFormulaAmount(100, 3333)).toBe(33);
  });

  it("ставки нет — 0, а не ошибка", () => {
    expect(computeFormulaAmount(650_000, null)).toBe(0);
  });

  it("база нулевая — 0 при любой ставке", () => {
    expect(computeFormulaAmount(0, 4000)).toBe(0);
  });
});

describe("computeAccrual — начисление за месяц", () => {
  const baseInput: AccrualComputationInput = {
    base: 1_000_000,
    studentsCount: 5,
    groupPercentBp: null,
    teacherPercentBp: null,
    manualAmount: null,
  };

  it("ставка группы применяется к базе", () => {
    const result = computeAccrual({ ...baseInput, groupPercentBp: 4000 });
    expect(result).toEqual({
      base: 1_000_000,
      studentsCount: 5,
      percentUsed: 4000,
      amount: 400_000,
      isFormula: true,
    });
  });

  it("ставки нет — сумма 0, но percentUsed остаётся null (не спутать с «месяц пустой»)", () => {
    const result = computeAccrual(baseInput);
    expect(result.amount).toBe(0);
    expect(result.percentUsed).toBeNull();
    expect(result.isFormula).toBe(false);
  });

  it("manualAmount важнее формулы, даже когда ставка есть", () => {
    const result = computeAccrual({ ...baseInput, groupPercentBp: 4000, manualAmount: 100_000 });
    expect(result.amount).toBe(100_000);
    expect(result.isFormula).toBe(false);
    // percentUsed всё равно виден в отчёте — админ должен понимать, что
    // именно он перебил своей правкой
    expect(result.percentUsed).toBe(4000);
  });

  it("manualAmount работает и без ставки (например, разовая компенсация замены)", () => {
    const result = computeAccrual({ ...baseInput, manualAmount: 50_000 });
    expect(result.amount).toBe(50_000);
    expect(result.percentUsed).toBeNull();
  });
});

describe("mergeAccrualMonths — закон закрытого месяца", () => {
  const now = new Date("2026-11-15T12:00:00.000Z");

  const computedInput = (percentBp: number | null, base = 1_000_000): AccrualComputationInput => ({
    base,
    studentsCount: 4,
    groupPercentBp: percentBp,
    teacherPercentBp: null,
    manualAmount: null,
  });

  it("закрытый месяц с сохранённой строкой берётся из неё, а не пересчитывается новой ставкой", () => {
    const stored: StoredAccrual[] = [
      {
        month: "2026-09",
        base: 1_000_000,
        studentsCount: 4,
        percentUsed: 3000, // ставка на момент заморозки — 30%
        amount: 300_000,
        manualAmount: null,
      },
    ];
    // Сейчас (в открытом ноябре) у группы уже 50% — но сентябрь заморожен
    const computed = [{ month: "2026-09", input: computedInput(5000) }];

    const result = mergeAccrualMonths(computed, stored, now);
    expect(result).toEqual([
      {
        month: "2026-09",
        accrual: { base: 1_000_000, studentsCount: 4, percentUsed: 3000, amount: 300_000, isFormula: true },
        locked: true,
      },
    ]);
  });

  it("открытый (текущий) месяц всегда считается формулой, даже если строка почему-то уже есть", () => {
    const stored: StoredAccrual[] = [
      { month: "2026-11", base: 500_000, studentsCount: 2, percentUsed: 2000, amount: 100_000, manualAmount: null },
    ];
    const computed = [{ month: "2026-11", input: computedInput(4000, 1_000_000) }];

    const result = mergeAccrualMonths(computed, stored, now);
    expect(result).toEqual([
      {
        month: "2026-11",
        accrual: { base: 1_000_000, studentsCount: 4, percentUsed: 4000, amount: 400_000, isFormula: true },
        locked: false,
      },
    ]);
  });

  it("зафиксированный месяц, которого больше нет среди вычисленных, не теряется", () => {
    const stored: StoredAccrual[] = [
      { month: "2026-08", base: 800_000, studentsCount: 3, percentUsed: 2500, amount: 200_000, manualAmount: null },
    ];
    const result = mergeAccrualMonths([], stored, now);
    expect(result).toHaveLength(1);
    expect(result[0].month).toBe("2026-08");
    expect(result[0].locked).toBe(true);
  });

  it("manualAmount на закрытом месяце перебивает замороженную сумму формулы", () => {
    const stored: StoredAccrual[] = [
      { month: "2026-09", base: 1_000_000, studentsCount: 4, percentUsed: 3000, amount: 300_000, manualAmount: 250_000 },
    ];
    const result = mergeAccrualMonths([{ month: "2026-09", input: computedInput(3000) }], stored, now);
    expect(result[0].accrual.amount).toBe(250_000);
    expect(result[0].accrual.isFormula).toBe(false);
  });

  it("месяцы сортируются по возрастанию", () => {
    const computed = [
      { month: "2026-10", input: computedInput(4000) },
      { month: "2026-08", input: computedInput(4000) },
      { month: "2026-09", input: computedInput(4000) },
    ];
    const result = mergeAccrualMonths(computed, [], now);
    expect(result.map((r) => r.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
});

describe("totalAccrued", () => {
  it("суммирует эффективную сумму месяцев", () => {
    const months = [
      { month: "2026-08", accrual: { base: 0, studentsCount: 0, percentUsed: null, amount: 100, isFormula: false }, locked: true },
      { month: "2026-09", accrual: { base: 0, studentsCount: 0, percentUsed: null, amount: 200, isFormula: false }, locked: true },
    ];
    expect(totalAccrued(months)).toBe(300);
  });
});

describe("payoutMonth", () => {
  it("forMonth указан явно — используется он", () => {
    expect(payoutMonth({ forMonth: "2026-08", paidAt: new Date("2026-09-05T12:00:00.000Z") })).toBe("2026-08");
  });

  it("forMonth не указан — берётся месяц даты выдачи", () => {
    expect(payoutMonth({ forMonth: null, paidAt: new Date("2026-09-05T12:00:00.000Z") })).toBe("2026-09");
  });
});

describe("isClosedMonth переиспользован из billing — тот же закон", () => {
  it("прошлый месяц закрыт", () => {
    expect(isClosedMonth("2026-08", new Date("2026-09-01T12:00:00.000Z"))).toBe(true);
  });

  it("текущий месяц ещё открыт", () => {
    expect(isClosedMonth("2026-09", new Date("2026-09-15T12:00:00.000Z"))).toBe(false);
  });
});
