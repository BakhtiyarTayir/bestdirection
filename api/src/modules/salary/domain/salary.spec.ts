import { describe, expect, it } from "vitest";
import {
  adjustmentSigned,
  allocateMonth,
  computeAccrual,
  computeFormulaAmount,
  computeMonthLessonMarks,
  countLessons,
  isClosedMonth,
  makeupAmountFor,
  regularLessonsOverPlan,
  type AttendanceSessionForSplit,
  mergeAccrualMonths,
  payoutMonth,
  resolveSalaryPercentBp,
  splitAccrualByTeacher,
  splitTeacherBalance,
  studentPaymentRows,
  sumAdjustments,
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
      lessonsPlanned: null,
      lessonsTaught: null,
      lessonsMakeup: 0,
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

  it("lessons не задано — считается по старой формуле целиком, lessonsPlanned/lessonsTaught пустые (запасной путь, 4.5)", () => {
    const result = computeAccrual({ ...baseInput, groupPercentBp: 4000 });
    expect(result.amount).toBe(400_000);
    expect(result.lessonsPlanned).toBeNull();
    expect(result.lessonsTaught).toBeNull();
  });

  it("lessons задано — amount берётся из amountOverride (раскладки), а не из base×percent напрямую", () => {
    const result = computeAccrual({
      ...baseInput,
      groupPercentBp: 4000,
      lessons: { planned: 13, taught: 12, makeup: 0, amountOverride: 443_077 },
    });
    expect(result.amount).toBe(443_077);
    // Ставка группы всё равно видна в отчёте — она не про раскладку, а про то,
    // из какого процента посчитана сумма ГРУППЫ целиком (план, раздел 0:
    // заменяющему платят по ставке группы, а не по своей)
    expect(result.percentUsed).toBe(4000);
    expect(result.lessonsPlanned).toBe(13);
    expect(result.lessonsTaught).toBe(12);
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
        lessonsPlanned: null,
        lessonsTaught: null,
        lessonsMakeup: 0,
      },
    ];
    // Сейчас (в открытом ноябре) у группы уже 50% — но сентябрь заморожен
    const computed = [{ month: "2026-09", input: computedInput(5000) }];

    const result = mergeAccrualMonths(computed, stored, now);
    expect(result).toEqual([
      {
        month: "2026-09",
        accrual: {
          base: 1_000_000,
          studentsCount: 4,
          percentUsed: 3000,
          amount: 300_000,
          isFormula: true,
          lessonsPlanned: null,
          lessonsTaught: null,
          lessonsMakeup: 0,
        },
        locked: true,
      },
    ]);
  });

  it("открытый (текущий) месяц всегда считается формулой, даже если строка почему-то уже есть", () => {
    const stored: StoredAccrual[] = [
      {
        month: "2026-11",
        base: 500_000,
        studentsCount: 2,
        percentUsed: 2000,
        amount: 100_000,
        manualAmount: null,
        lessonsPlanned: null,
        lessonsTaught: null,
        lessonsMakeup: 0,
      },
    ];
    const computed = [{ month: "2026-11", input: computedInput(4000, 1_000_000) }];

    const result = mergeAccrualMonths(computed, stored, now);
    expect(result).toEqual([
      {
        month: "2026-11",
        accrual: {
          base: 1_000_000,
          studentsCount: 4,
          percentUsed: 4000,
          amount: 400_000,
          isFormula: true,
          lessonsPlanned: null,
          lessonsTaught: null,
          lessonsMakeup: 0,
        },
        locked: false,
      },
    ]);
  });

  it("зафиксированный месяц, которого больше нет среди вычисленных, не теряется", () => {
    const stored: StoredAccrual[] = [
      {
        month: "2026-08",
        base: 800_000,
        studentsCount: 3,
        percentUsed: 2500,
        amount: 200_000,
        manualAmount: null,
        lessonsPlanned: null,
        lessonsTaught: null,
        lessonsMakeup: 0,
      },
    ];
    const result = mergeAccrualMonths([], stored, now);
    expect(result).toHaveLength(1);
    expect(result[0].month).toBe("2026-08");
    expect(result[0].locked).toBe(true);
  });

  it("manualAmount на закрытом месяце перебивает замороженную сумму формулы", () => {
    const stored: StoredAccrual[] = [
      {
        month: "2026-09",
        base: 1_000_000,
        studentsCount: 4,
        percentUsed: 3000,
        amount: 300_000,
        manualAmount: 250_000,
        lessonsPlanned: null,
        lessonsTaught: null,
        lessonsMakeup: 0,
      },
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
      {
        month: "2026-08",
        accrual: { base: 0, studentsCount: 0, percentUsed: null, amount: 100, isFormula: false, lessonsPlanned: null, lessonsTaught: null, lessonsMakeup: 0 },
        locked: true,
      },
      {
        month: "2026-09",
        accrual: { base: 0, studentsCount: 0, percentUsed: null, amount: 200, isFormula: false, lessonsPlanned: null, lessonsTaught: null, lessonsMakeup: 0 },
        locked: true,
      },
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

// ─── Зарплата по проведённым занятиям (план «Уроки и карточка группы», этап 3) ───

describe("computeMonthLessonMarks — когда раскладка вообще возможна (4.5)", () => {
  const scheduleDays = [2, 4, 6]; // вт/чт/сб
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-30T00:00:00.000Z");

  it("нет расписания — запасной путь, даже если в журнале есть записи", () => {
    const marks = computeMonthLessonMarks([], from, to, [
      { date: new Date("2026-09-02T00:00:00.000Z"), teacherStatus: "PRESENT", responsibleTeacherId: "t1", isMakeup: false },
    ]);
    expect(marks.fallback).toBe(true);
    expect(marks.lessonsPlanned).toBe(0);
  });

  it("расписание есть, но за месяц ни одной записи в журнале — запасной путь", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, []);
    expect(marks.fallback).toBe(true);
    expect(marks.lessonsPlanned).toBeGreaterThan(0);
    expect(marks.sessionsMarked).toBe(0);
  });

  /** Все занятия месяца по расписанию — полный журнал */
  const fullMonth = (status: (index: number) => string = () => "PRESENT") => {
    const dates: Date[] = [];
    for (let day = 1; day <= 30; day++) {
      const date = new Date(Date.UTC(2026, 8, day));
      const iso = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      if (scheduleDays.includes(iso)) dates.push(date);
    }
    return dates.map((date, index) => ({ date, teacherStatus: status(index), responsibleTeacherId: "t1", isMakeup: false }));
  };

  it("отмечено меньше занятий, чем по расписанию, — запасной путь (вариант А)", () => {
    // Две отметки из тринадцати: раньше педагог получал 2/13 месяца
    const marks = computeMonthLessonMarks(scheduleDays, from, to, fullMonth().slice(0, 2));
    expect(marks.fallback).toBe(true);
    expect(marks.sessionsMarked).toBe(2);
    expect(marks.taughtByTeacher.size).toBe(0);
  });

  it("отмечены все занятия по расписанию — раскладка возможна", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, fullMonth());
    expect(marks.fallback).toBe(false);
    expect(marks.sessionsMarked).toBe(marks.lessonsPlanned);
    expect(marks.taughtByTeacher.get("t1")).toBe(marks.lessonsPlanned);
  });

  it("ABSENT не засчитывается никому, но и знаменатель (lessonsPlanned) не уменьшает (4.3)", () => {
    // ABSENT — это отметка: журнал за месяц полный, раскладка идёт
    const marks = computeMonthLessonMarks(scheduleDays, from, to, fullMonth((index) => (index === 0 ? "ABSENT" : "PRESENT")));
    expect(marks.fallback).toBe(false);
    expect(marks.taughtByTeacher.get("t1")).toBe(marks.lessonsPlanned - 1);
    expect(marks.lessonsPlanned).toBe(countLessons(scheduleDays, from, to));
  });

  it("ведущий неизвестен (лестница не разрешилась) — занятие не засчитывается никому", () => {
    const sessions = fullMonth().map((session) => ({ ...session, responsibleTeacherId: null }));
    const marks = computeMonthLessonMarks(scheduleDays, from, to, sessions);
    expect(marks.fallback).toBe(false);
    expect(marks.taughtByTeacher.size).toBe(0);
    expect(marks.countedSessions).toHaveLength(0);
  });
});

describe("splitAccrualByTeacher — раскладка суммы по занятиям (план, шесть сценариев раздела 4.9)", () => {
  const scheduleDays = [2, 4, 6]; // вт/чт/сб, как в примере плана (4.2)
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-30T00:00:00.000Z");
  const lessonsPlanned = countLessons(scheduleDays, from, to);
  const groupMonthAmount = 1_200_000; // как в примере плана: группа 10×300000, ставка 40%
  const pricePerLesson = Math.round(groupMonthAmount / lessonsPlanned);

  it("сценарий 1: цена занятия и сумма при полном месяце — всё по плану, вся сумма основному", () => {
    const shares = splitAccrualByTeacher(groupMonthAmount, lessonsPlanned, new Map([["main", lessonsPlanned]]));
    expect(shares).toEqual([{ teacherId: "main", lessonsTaught: lessonsPlanned, amount: groupMonthAmount }]);
  });

  it("сценарий 2: замена одного занятия — сумма основного и заменяющего в точности равна месячной", () => {
    const shares = splitAccrualByTeacher(
      groupMonthAmount,
      lessonsPlanned,
      new Map([
        ["main", lessonsPlanned - 1],
        ["sub", 1],
      ])
    );
    const total = shares.reduce((sum, share) => sum + share.amount, 0);
    expect(total).toBe(groupMonthAmount);
    expect(shares.find((share) => share.teacherId === "sub")?.amount).toBe(pricePerLesson);
  });

  it("сценарий 3: пропуск без отработки — сумма меньше месячной ровно на цену занятия", () => {
    const shares = splitAccrualByTeacher(groupMonthAmount, lessonsPlanned, new Map([["main", lessonsPlanned - 1]]));
    const total = shares.reduce((sum, share) => sum + share.amount, 0);
    expect(groupMonthAmount - total).toBe(pricePerLesson);
  });

  it("сценарий 4: обычные занятия сверх плана денег не добавляют — одно лишнее, сумма ровно месячная", () => {
    const shares = splitAccrualByTeacher(groupMonthAmount, lessonsPlanned, new Map([["main", lessonsPlanned + 1]]));
    expect(shares).toEqual([{ teacherId: "main", lessonsTaught: lessonsPlanned + 1, amount: groupMonthAmount }]);
  });

  it("16 занятий при плане 14 — ровно 1 200 000, а не 1 371 429", () => {
    const shares = splitAccrualByTeacher(1_200_000, 14, new Map([["main", 16]]));
    expect(shares).toEqual([{ teacherId: "main", lessonsTaught: 16, amount: 1_200_000 }]);
  });

  it("основной 12 + замена 4 при плане 14: делится на 16, сумма ровно групповая (900 000 и 300 000)", () => {
    const shares = splitAccrualByTeacher(
      1_200_000,
      14,
      new Map([
        ["main", 12],
        ["sub", 4],
      ])
    );
    expect(shares.find((s) => s.teacherId === "main")?.amount).toBe(900_000);
    expect(shares.find((s) => s.teacherId === "sub")?.amount).toBe(300_000);
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(1_200_000);
  });

  it("сценарий 5: округление — при полном месяце сумма долей в точности равна целому (остаток по наибольшей дробной части)", () => {
    const third = Math.ceil(lessonsPlanned / 3);
    const taughtByTeacher = new Map([
      ["a", third],
      ["b", third],
      ["c", lessonsPlanned - 2 * third],
    ]);
    const shares = splitAccrualByTeacher(999_999, lessonsPlanned, taughtByTeacher);
    const total = shares.reduce((sum, share) => sum + share.amount, 0);
    expect(total).toBe(999_999);
  });

  it("никто ничего не провёл — раскладки нет вообще (пустой список, а не деление на ноль)", () => {
    expect(splitAccrualByTeacher(groupMonthAmount, lessonsPlanned, new Map())).toEqual([]);
  });
});

describe("сценарий 6: запасной путь — нет расписания или нет отметок, одна строка педагогу группы (интеграция с computeAccrual)", () => {
  it("computeAccrual без lessons — ведёт себя как единственная строка педагогу группы, как и раньше", () => {
    const result = computeAccrual({
      base: 3_000_000,
      studentsCount: 10,
      groupPercentBp: 4000,
      teacherPercentBp: null,
      manualAmount: null,
      // lessons не передан — ровно то, что unitSchedule() кладёт при
      // marks.fallback (нет расписания или нет ни одной отметки, 4.5)
    });
    expect(result.amount).toBe(1_200_000);
    expect(result.lessonsPlanned).toBeNull();
    expect(result.lessonsTaught).toBeNull();
  });
});

// ─── Отработки: явная галочка, оплата сверх суммы группы ───

describe("отработки (isMakeup)", () => {
  const scheduleDays = [2, 4, 6]; // сентябрь 2026: 13 занятий
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-30T00:00:00.000Z");
  const planned = countLessons(scheduleDays, from, to);

  const regularDates = () => {
    const out: Date[] = [];
    for (let day = 1; day <= 30; day++) {
      const date = new Date(Date.UTC(2026, 8, day));
      const iso = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      if (scheduleDays.includes(iso)) out.push(date);
    }
    return out;
  };
  const session = (
    date: Date,
    teacherId: string,
    extra: Partial<AttendanceSessionForSplit> = {}
  ): AttendanceSessionForSplit => ({
    date,
    teacherStatus: "PRESENT",
    responsibleTeacherId: teacherId,
    isMakeup: false,
    ...extra,
  });
  const fullMonth = (teacherId = "main") => regularDates().map((d) => session(d, teacherId));
  const makeupDay = (day: number, teacherId = "main", extra: Partial<AttendanceSessionForSplit> = {}) =>
    session(new Date(Date.UTC(2026, 8, day)), teacherId, { isMakeup: true, ...extra });

  it("цена одного занятия округляется, потом умножается: 1 200 000 / 14 → 2 × 85 714 = 171 428", () => {
    expect(makeupAmountFor(1_200_000, 14, 2)).toBe(171_428);
    // BestCRM округляет сумму целиком (round(1 200 000 × 2 / 14) = 171 429); у нас — цену занятия
    expect(Math.round((1_200_000 * 2) / 14)).toBe(171_429);
    expect(makeupAmountFor(1_200_000, 0, 2)).toBe(0);
    expect(makeupAmountFor(1_200_000, 14, 0)).toBe(0);
  });

  it("14 обычных + 2 отработки: 1 200 000 + 171 428 = 1 371 428", () => {
    const fake = {
      lessonsPlanned: 14,
      sessionsMarked: 14,
      fallback: false,
      taughtByTeacher: new Map([["main", 14]]),
      makeupByTeacher: new Map([["main", 2]]),
      countedSessions: [],
    };
    const { rows, lessonsPlanned } = allocateMonth(1_200_000, fake, "main");
    expect(lessonsPlanned).toBe(14);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shareAmount: 1_200_000, makeupAmount: 171_428, amount: 1_371_428, lessonsMakeup: 2 });
  });

  it("обычные занятия сверх плана денег не добавляют (отметили на два больше, без галочки)", () => {
    const sessions = [...fullMonth(), session(new Date("2026-09-07T00:00:00.000Z"), "main"), session(new Date("2026-09-08T00:00:00.000Z"), "main")];
    const marks = computeMonthLessonMarks(scheduleDays, from, to, sessions);
    expect(marks.taughtByTeacher.get("main")).toBe(planned + 2);
    const { rows } = allocateMonth(1_300_000, marks, "main");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1_300_000);
  });

  it("отработка не входит ни в обычные проведённые, ни в sessionsMarked", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, [...fullMonth(), makeupDay(7)]);
    expect(marks.sessionsMarked).toBe(planned);
    expect(marks.taughtByTeacher.get("main")).toBe(planned);
    expect(marks.makeupByTeacher.get("main")).toBe(1);
    expect(marks.countedSessions.filter((s) => s.isMakeup)).toHaveLength(1);
  });

  it("отработка с ABSENT не оплачивается", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, [...fullMonth(), makeupDay(7, "main", { teacherStatus: "ABSENT" })]);
    expect(marks.makeupByTeacher.size).toBe(0);
    expect(allocateMonth(1_300_000, marks, "main").rows[0].amount).toBe(1_300_000);
  });

  it("отработка без ведущего не оплачивается", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, [...fullMonth(), makeupDay(7, "main", { responsibleTeacherId: null })]);
    expect(marks.makeupByTeacher.size).toBe(0);
  });

  it("отработка замены идёт замене; строка владельца остаётся", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, [...fullMonth("main"), makeupDay(7, "sub")]);
    const { rows } = allocateMonth(1_300_000, marks, "main");
    const main = rows.find((r) => r.teacherId === "main")!;
    const sub = rows.find((r) => r.teacherId === "sub")!;
    expect(main.amount).toBe(1_300_000);
    expect(sub).toMatchObject({ lessonsTaught: 0, lessonsMakeup: 1, shareAmount: 0, amount: 100_000 });
  });

  it("нет расписания (lessonsPlanned = 0) — отработка не оплачивается", () => {
    const marks = computeMonthLessonMarks([], from, to, [makeupDay(7)]);
    expect(marks.makeupByTeacher.size).toBe(0);
    expect(allocateMonth(500_000, marks, "main").rows[0].amount).toBe(500_000);
  });

  it("отработка не закрывает неполный журнал (fallback остаётся) и оплачивается в нём сверх суммы", () => {
    const sessions = [...fullMonth().slice(0, 3), makeupDay(7, "main"), makeupDay(9, "sub")];
    const marks = computeMonthLessonMarks(scheduleDays, from, to, sessions);
    expect(marks.fallback).toBe(true);
    expect(marks.sessionsMarked).toBe(3);
    const { rows, lessonsPlanned } = allocateMonth(1_300_000, marks, "main");
    expect(lessonsPlanned).toBeNull();
    const main = rows.find((r) => r.teacherId === "main")!;
    const sub = rows.find((r) => r.teacherId === "sub")!;
    expect(main).toMatchObject({ lessonsTaught: null, lessonsMakeup: 1, amount: 1_300_000 + 100_000 });
    expect(sub).toMatchObject({ lessonsTaught: null, lessonsMakeup: 1, amount: 100_000 });
  });

  it("владелец без доли получает строку с нулём, даже если отработку провёл только другой", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, [...fullMonth("sub"), makeupDay(7, "sub")]);
    const { rows } = allocateMonth(1_300_000, marks, "main");
    expect(rows.find((r) => r.teacherId === "main")).toMatchObject({ amount: 0, lessonsTaught: 0 });
    expect(rows.find((r) => r.teacherId === "sub")?.amount).toBe(1_300_000 + 100_000);
  });

  it("живой расчёт и заморозка дают одну сумму: computeAccrual по allocateMonth == строка, которую пишет заморозка", () => {
    const marks = computeMonthLessonMarks(scheduleDays, from, to, [...fullMonth("main"), makeupDay(7, "sub"), makeupDay(9, "main")]);
    const { rows, lessonsPlanned } = allocateMonth(1_300_000, marks, "main");
    for (const row of rows) {
      const live = computeAccrual({
        base: 3_250_000,
        studentsCount: 10,
        groupPercentBp: 4000,
        teacherPercentBp: null,
        manualAmount: null,
        lessons: { planned: lessonsPlanned, taught: row.lessonsTaught, makeup: row.lessonsMakeup, amountOverride: row.amount },
      });
      const frozen: StoredAccrual = {
        month: "2026-09",
        base: 3_250_000,
        studentsCount: 10,
        percentUsed: 4000,
        amount: row.amount,
        manualAmount: null,
        lessonsPlanned,
        lessonsTaught: row.lessonsTaught,
        lessonsMakeup: row.lessonsMakeup,
      };
      const [merged] = mergeAccrualMonths([], [frozen], new Date("2026-11-08T12:00:00.000Z"));
      expect(merged.accrual.amount).toBe(live.amount);
      expect(merged.accrual.lessonsMakeup).toBe(live.lessonsMakeup);
    }
  });

  it("manualAmount перебивает всё, включая отработки", () => {
    const result = computeAccrual({
      base: 1,
      studentsCount: 1,
      groupPercentBp: 4000,
      teacherPercentBp: null,
      manualAmount: 777,
      lessons: { planned: 14, taught: 14, makeup: 2, amountOverride: 1_371_428 },
    });
    expect(result.amount).toBe(777);
    expect(result.lessonsMakeup).toBe(2);
  });

  it("старая замороженная строка (lessonsMakeup NULL) читается как 0", () => {
    const [merged] = mergeAccrualMonths(
      [],
      [{ month: "2026-08", base: 1, studentsCount: 1, percentUsed: 4000, amount: 5, manualAmount: null, lessonsPlanned: null, lessonsTaught: null, lessonsMakeup: null }],
      new Date("2026-11-08T12:00:00.000Z")
    );
    expect(merged.accrual.lessonsMakeup).toBe(0);
  });
});

describe("regularLessonsOverPlan — порог предупреждения о занятии сверх расписания", () => {
  const regular = (n: number, extra: { isMakeup?: boolean; teacherStatus?: string | null } = {}) =>
    Array.from({ length: n }, () => ({ isMakeup: false, teacherStatus: null as string | null, ...extra }));

  it("ровно по плану — предупреждения нет", () => {
    expect(regularLessonsOverPlan(14, regular(14))).toEqual({ regular: 14, over: false });
  });
  it("план + 1 — предупреждение есть", () => {
    expect(regularLessonsOverPlan(14, regular(15))).toEqual({ regular: 15, over: true });
  });
  it("отработки не считаются", () => {
    expect(regularLessonsOverPlan(14, [...regular(14), ...regular(3, { isMakeup: true })]).over).toBe(false);
  });
  it("ABSENT не считается", () => {
    expect(regularLessonsOverPlan(14, [...regular(14), ...regular(2, { teacherStatus: "ABSENT" })]).over).toBe(false);
  });
  it("группа без расписания — предупреждения нет", () => {
    expect(regularLessonsOverPlan(0, regular(5)).over).toBe(false);
  });
});

describe("studentPaymentRows — поступления по ученикам за месяц", () => {
  const charge = (studentId: string, lastName: string, amount: number, unenrolled = false) => ({
    studentId,
    firstName: "Имя",
    lastName,
    unenrolled,
    amount,
  });
  const pay = (studentId: string, amount: number, forMonth: string | null, paidAt = "2026-09-10T12:00:00.000Z") => ({
    studentId,
    amount,
    forMonth,
    paidAt: new Date(paidAt),
  });

  it("итоги, остаток и сортировка: с остатком по убыванию, потом оплатившие, переплата последней", () => {
    const result = studentPaymentRows(
      [charge("a", "Алиев", 300_000), charge("b", "Бобров", 300_000), charge("c", "Волков", 300_000), charge("d", "Гарин", 300_000)],
      [pay("a", 300_000, "2026-09"), pay("b", 100_000, "2026-09"), pay("c", 350_000, "2026-09")],
      "2026-09"
    );
    expect(result.students.map((row) => row.studentId)).toEqual(["d", "b", "a", "c"]);
    expect(result.students.map((row) => row.remaining)).toEqual([300_000, 200_000, 0, -50_000]);
    expect(result.totals).toEqual({ charged: 1_200_000, paid: 750_000, remaining: 450_000 });
  });

  it("месяц платежа: forMonth, а без него — месяц paidAt; чужой месяц не считается", () => {
    const result = studentPaymentRows(
      [charge("a", "Алиев", 100_000)],
      [pay("a", 10, "2026-09"), pay("a", 20, null, "2026-09-20T12:00:00.000Z"), pay("a", 40, "2026-10"), pay("a", 80, null, "2026-10-02T12:00:00.000Z")],
      "2026-09"
    );
    expect(result.students[0].paid).toBe(30);
  });

  it("без начисления, но с оплатой — в списке; без обоих — нет; оплата постороннего игнорируется", () => {
    const result = studentPaymentRows(
      [charge("a", "Алиев", 0), charge("b", "Бобров", 0)],
      [pay("a", 5_000, "2026-09"), pay("zzz", 9_000, "2026-09")],
      "2026-09"
    );
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({ studentId: "a", charged: 0, paid: 5_000, remaining: -5_000 });
    expect(result.totals.paid).toBe(5_000);
  });

  it("отчисленный помечается, строки одного ученика суммируются", () => {
    const result = studentPaymentRows([charge("a", "Алиев", 100, true), charge("a", "Алиев", 50)], [], "2026-09");
    expect(result.students).toEqual([
      { studentId: "a", firstName: "Имя", lastName: "Алиев", unenrolled: true, charged: 150, paid: 0, remaining: 150 },
    ]);
  });
});

describe("премии и штрафы", () => {
  const bonus = (amount: number, month: string, deletedAt: Date | null = null) => ({ kind: "BONUS" as const, amount, month, deletedAt });
  const penalty = (amount: number, month: string, deletedAt: Date | null = null) => ({ kind: "PENALTY" as const, amount, month, deletedAt });

  it("знак: премия плюс, штраф минус", () => {
    expect(adjustmentSigned(bonus(100, "2026-09"))).toBe(100);
    expect(adjustmentSigned(penalty(100, "2026-09"))).toBe(-100);
  });

  it("сумма со знаком по всем месяцам", () => {
    expect(sumAdjustments([bonus(500, "2026-08"), penalty(200, "2026-09"), bonus(50, "2026-10")])).toBe(350);
    expect(sumAdjustments([])).toBe(0);
  });

  it("upTo — месяцы включительно до границы, only — ровно один месяц", () => {
    const list = [bonus(500, "2026-08"), penalty(200, "2026-09"), bonus(50, "2026-10")];
    expect(sumAdjustments(list, { upTo: "2026-09" })).toBe(300);
    expect(sumAdjustments(list, { only: "2026-09" })).toBe(-200);
    expect(sumAdjustments(list, { only: "2026-07" })).toBe(0);
  });

  it("удалённые не учитываются", () => {
    const list = [bonus(500, "2026-09"), penalty(200, "2026-09", new Date())];
    expect(sumAdjustments(list)).toBe(500);
    expect(sumAdjustments(list, { only: "2026-09" })).toBe(500);
  });
});

describe("splitTeacherBalance — остаток прошлых месяцев отдельно от месяца M", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

  it("пустая история — всё нули", () => {
    expect(splitTeacherBalance({ accruedByMonth: [], adjustments: [], payouts: [] }, "2026-11")).toEqual({
      carriedOver: 0,
      accrued: 0,
      paidMonth: 0,
      paidTotal: 0,
      accruedTotal: 0,
      debt: 0,
    });
  });

  it("долг октября + ноябрь: остаток отдельно, итог тот же", () => {
    const r = splitTeacherBalance(
      {
        accruedByMonth: [
          { month: "2026-10", amount: 2_582_769 },
          { month: "2026-11", amount: 2_719_200 },
        ],
        adjustments: [],
        payouts: [{ amount: 2_394_000, forMonth: "2026-10", paidAt: at("2026-11-03") }],
      },
      "2026-11"
    );
    expect(r.carriedOver).toBe(188_769);
    expect(r.accrued).toBe(2_719_200);
    expect(r.paidMonth).toBe(0);
    expect(r.debt).toBe(2_907_969);
    expect(r.debt).toBe(r.accruedTotal - r.paidTotal);
  });

  it("выплата за октябрь, сделанная в ноябре (forMonth=2026-10), уменьшает остаток, а не paidMonth", () => {
    const r = splitTeacherBalance(
      {
        accruedByMonth: [{ month: "2026-10", amount: 500 }],
        adjustments: [],
        payouts: [{ amount: 200, forMonth: "2026-10", paidAt: at("2026-11-20") }],
      },
      "2026-11"
    );
    expect(r).toMatchObject({ carriedOver: 300, paidMonth: 0, debt: 300 });
  });

  it("выплата без forMonth считается по дате выдачи", () => {
    const r = splitTeacherBalance(
      {
        accruedByMonth: [{ month: "2026-10", amount: 500 }, { month: "2026-11", amount: 100 }],
        adjustments: [],
        payouts: [
          { amount: 100, forMonth: null, paidAt: at("2026-10-25") },
          { amount: 50, forMonth: null, paidAt: at("2026-11-02") },
        ],
      },
      "2026-11"
    );
    expect(r).toMatchObject({ carriedOver: 400, accrued: 100, paidMonth: 50, debt: 450 });
  });

  it("переплата — остаток отрицательный", () => {
    const r = splitTeacherBalance(
      {
        accruedByMonth: [{ month: "2026-10", amount: 100 }, { month: "2026-11", amount: 300 }],
        adjustments: [],
        payouts: [{ amount: 250, forMonth: "2026-10", paidAt: at("2026-10-30") }],
      },
      "2026-11"
    );
    expect(r.carriedOver).toBe(-150);
    expect(r.debt).toBe(150);
  });

  it("выплата и начисление за будущий месяц не участвуют", () => {
    const r = splitTeacherBalance(
      {
        accruedByMonth: [{ month: "2026-11", amount: 300 }, { month: "2026-12", amount: 999 }],
        adjustments: [{ kind: "BONUS", amount: 77, month: "2026-12" }],
        payouts: [{ amount: 500, forMonth: "2026-12", paidAt: at("2026-11-10") }],
      },
      "2026-11"
    );
    expect(r).toMatchObject({ carriedOver: 0, accrued: 300, paidMonth: 0, paidTotal: 0, debt: 300 });
  });

  it("премия и штраф прошлого месяца — в остатке, текущего — в начислено; удалённые не считаются", () => {
    const r = splitTeacherBalance(
      {
        accruedByMonth: [{ month: "2026-10", amount: 1000 }, { month: "2026-11", amount: 2000 }],
        adjustments: [
          { kind: "BONUS", amount: 100, month: "2026-10" },
          { kind: "PENALTY", amount: 30, month: "2026-10" },
          { kind: "BONUS", amount: 50, month: "2026-11" },
          { kind: "PENALTY", amount: 20, month: "2026-11" },
          { kind: "BONUS", amount: 9999, month: "2026-10", deletedAt: at("2026-11-01") },
        ],
        payouts: [],
      },
      "2026-11"
    );
    expect(r.carriedOver).toBe(1070);
    expect(r.accrued).toBe(2030);
    expect(r.debt).toBe(3100);
  });
});
