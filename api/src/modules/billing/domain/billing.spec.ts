import { describe, expect, it } from "vitest";
import {
  chargeForMonth,
  chargeSchedule,
  totalCharged,
  countLessons,
  monthRange,
  addMonths,
  monthKey,
  currentMonthKey,
  currentDateKey,
  paymentMonth,
  isClosedMonth,
  mergeSchedule,
  priceFor,
  type BillingEnrollment,
  type MonthCharge,
  type StoredCharge,
} from "./billing";

// Проверки перенесены из scripts/check-billing.ts в web один в один: те же
// названия, те же ожидания. Сравнение через JSON, как в исходнике, — важен
// порядок ключей и точные числа.
function check(name: string, actual: unknown, expected: unknown) {
  it(name, () => {
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  });
}

describe("расчёт начислений", () => {
const utc = (s: string) => new Date(`${s}T12:00:00.000Z`);

const base: BillingEnrollment = {
  startsAt: null,
  createdAt: utc("2026-07-25"),
  billingEndsAt: null,
  priceOverride: null,
  firstMonthCharge: null,
  groupPrice: 650000,
  scheduleDays: [1, 3, 5], // пн/ср/пт
  groupEndDate: null,
  groupStartDate: null,
};

const MWF = [1, 3, 5];
const TTS = [2, 4, 6]; // вт/чт/сб

console.log("── подсчёт занятий ──");
check("пн/ср/пт за весь июль 2026", countLessons(MWF, utc("2026-07-01"), utc("2026-07-31")), 14);
check("вт/чт/сб за весь июль 2026", countLessons(TTS, utc("2026-07-01"), utc("2026-07-31")), 13);
check("пн/ср/пт с 25 июля", countLessons(MWF, utc("2026-07-25"), utc("2026-07-31")), 3);
check("вт/чт/сб с 25 июля (суббота — учебная)", countLessons(TTS, utc("2026-07-25"), utc("2026-07-31")), 3);
check("вт/чт/сб с 31 июля (занятий нет)", countLessons(TTS, utc("2026-07-31"), utc("2026-07-31")), 0);

// ── первый неполный месяц ──
check(
  "пришёл 25.07 в пн/ср/пт: 650000 × 3/14",
  chargeForMonth({ ...base, startsAt: utc("2026-07-25") }, "2026-07"),
  { amount: 139286, basis: "lessons", unitsTotal: 14, unitsBilled: 3 }
);
check(
  "пришёл 25.07 в вт/чт/сб: 650000 × 3/13, день прихода учебный",
  chargeForMonth({ ...base, scheduleDays: TTS, startsAt: utc("2026-07-25") }, "2026-07"),
  { amount: 150000, basis: "lessons", unitsTotal: 13, unitsBilled: 3 }
);
check(
  "пришёл 31.07 в вт/чт/сб: занятий не осталось → 0",
  chargeForMonth({ ...base, scheduleDays: TTS, startsAt: utc("2026-07-31") }, "2026-07"),
  { amount: 0, basis: "lessons", unitsTotal: 13, unitsBilled: 0 }
);
check(
  "следующий месяц после неполного — полный",
  chargeForMonth({ ...base, startsAt: utc("2026-07-25") }, "2026-08"),
  { amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 }
);
check(
  "месяц до прихода не начисляется",
  chargeForMonth({ ...base, startsAt: utc("2026-07-25") }, "2026-06"),
  { amount: 0, basis: "none", unitsTotal: 0, unitsBilled: 0 }
);

// ── дата начала группы ──
check(
  "запись заведена раньше старта группы → считаем с группы",
  chargeForMonth(
    { ...base, createdAt: utc("2026-07-01"), groupStartDate: utc("2026-07-25") },
    "2026-07"
  ),
  { amount: 139286, basis: "lessons", unitsTotal: 14, unitsBilled: 3 }
);
check(
  "месяц до старта группы не начисляется",
  chargeForMonth(
    { ...base, createdAt: utc("2026-06-01"), groupStartDate: utc("2026-07-25") },
    "2026-06"
  ),
  { amount: 0, basis: "none", unitsTotal: 0, unitsBilled: 0 }
);
check(
  "пришёл позже старта группы → считаем с его дня",
  chargeForMonth(
    { ...base, startsAt: utc("2026-07-25"), groupStartDate: utc("2026-07-01") },
    "2026-07"
  ),
  { amount: 139286, basis: "lessons", unitsTotal: 14, unitsBilled: 3 }
);
check(
  "оба с первого числа → полный месяц",
  chargeForMonth(
    { ...base, createdAt: utc("2026-07-01"), groupStartDate: utc("2026-07-01") },
    "2026-07"
  ),
  { amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 }
);
check(
  "без даты у группы поведение прежнее",
  chargeForMonth({ ...base, startsAt: utc("2026-07-25") }, "2026-07").amount,
  139286
);
// Регрессия: дата группы приходила из формы полночью по локали (UTC+5) и
// сохранялась как 19:00 предыдущих суток. Старт 01.10 превращался в 30.09 —
// среду, учебный день, — и за сентябрь набегало 650000 × 1/13 = 50000
// у студента, который не был ни на одном занятии.
check(
  "старт группы 01.10: сентябрь не начисляется",
  chargeForMonth(
    { ...base, createdAt: utc("2026-09-12"), groupStartDate: utc("2026-10-01") },
    "2026-09"
  ),
  { amount: 0, basis: "none", unitsTotal: 0, unitsBilled: 0 }
);
check(
  "старт группы 01.10: октябрь идёт полным месяцем",
  chargeForMonth(
    { ...base, createdAt: utc("2026-09-12"), groupStartDate: utc("2026-10-01") },
    "2026-10"
  ),
  { amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 }
);
check(
  "а сдвинутая на сутки дата дала бы те самые 50000",
  chargeForMonth(
    {
      ...base,
      createdAt: utc("2026-09-12"),
      groupStartDate: new Date("2026-09-30T19:00:00.000Z"),
    },
    "2026-09"
  ).amount,
  50000
);

// ── ручная правка суммы админом ──
check(
  "firstMonthCharge=139000 перебивает формулу",
  chargeForMonth({ ...base, startsAt: utc("2026-07-25"), firstMonthCharge: 139000 }, "2026-07"),
  { amount: 139000, basis: "manual", unitsTotal: 0, unitsBilled: 0 }
);
check(
  "но на полный месяц ручная сумма не влияет",
  chargeForMonth({ ...base, startsAt: utc("2026-07-25"), firstMonthCharge: 139000 }, "2026-08").amount,
  650000
);

// ── уход и пауза ──
check(
  "ушёл 10.09 (пн/ср/пт: 2,4,7,9 = 4 из 13) → 650000 × 4/13",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), billingEndsAt: utc("2026-09-10") }, "2026-09"),
  { amount: 200000, basis: "lessons", unitsTotal: 13, unitsBilled: 4 }
);
check(
  "месяц после ухода не начисляется",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), billingEndsAt: utc("2026-09-10") }, "2026-10").basis,
  "none"
);
check(
  "конец группы прекращает начисления так же",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), groupEndDate: utc("2026-08-31") }, "2026-09").basis,
  "none"
);

// ── цена ──
check(
  "priceOverride вместо цены группы",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), priceOverride: 400000 }, "2026-08").amount,
  400000
);
check(
  "группа без цены не биллится (цена курса в начислениях не участвует)",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), groupPrice: null }, "2026-08").basis,
  "none"
);

// ── цена группы ──
check("цена группы", priceFor(base), 650000);
check("ни цены группы, ни своей — цены нет", priceFor({ ...base, groupPrice: null }), null);
check(
  "цена студента важнее цены группы",
  priceFor({ ...base, groupPrice: 500000, priceOverride: 450000 }),
  450000
);
check(
  "полный месяц идёт по цене группы",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), groupPrice: 500000 }, "2026-08"),
  { amount: 500000, basis: "full", unitsTotal: 1, unitsBilled: 1 }
);
check(
  "неполный месяц — пропорция от цены группы: 520000 × 3/13",
  chargeForMonth(
    { ...base, scheduleDays: TTS, startsAt: utc("2026-07-25"), groupPrice: 520000 },
    "2026-07"
  ),
  { amount: 120000, basis: "lessons", unitsTotal: 13, unitsBilled: 3 }
);
check(
  "цена ученика важнее цены группы",
  chargeForMonth(
    { ...base, startsAt: utc("2026-07-01"), priceOverride: 400000, groupPrice: 500000 },
    "2026-08"
  ).amount,
  400000
);
check(
  "новая цена группы не переписывает закрытый месяц",
  mergeSchedule(
    chargeSchedule({ ...base, startsAt: utc("2026-09-01"), groupPrice: 800000 }, "2026-10"),
    [{ month: "2026-09", amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 }],
    utc("2026-10-15")
  ).map((m) => [m.month, m.charge.amount]),
  [["2026-09", 650000], ["2026-10", 800000]]
);

// ── группа без расписания ──
check(
  "фолбэк на дни: 7 из 31",
  chargeForMonth({ ...base, scheduleDays: [], startsAt: utc("2026-07-25") }, "2026-07"),
  { amount: Math.round((650000 * 7) / 31), basis: "days", unitsTotal: 31, unitsBilled: 7 }
);

// ── накопительный итог ──
const student: BillingEnrollment = { ...base, scheduleDays: TTS, startsAt: utc("2026-07-25") };
check(
  "разбивка июль–сентябрь",
  chargeSchedule(student, "2026-09").map((m) => [m.month, m.charge.amount]),
  [["2026-07", 150000], ["2026-08", 650000], ["2026-09", 650000]]
);
check("начислено всего к сентябрю", totalCharged(student, "2026-09"), 1450000);

// ── фиксация закрытых месяцев ──
// «Сейчас» задаём явно, иначе проверки поедут при смене календарного месяца
const NOW = utc("2026-10-15");
check("прошедший месяц закрыт", isClosedMonth("2026-09", NOW), true);
check("текущий месяц открыт", isClosedMonth("2026-10", NOW), false);
check("будущий месяц открыт", isClosedMonth("2026-11", NOW), false);

// ── текущий месяц по Ташкенту (UTC+5), а не по UTC ──
// 2026-09-30T19:30:00Z — в Ташкенте уже 2026-10-01T00:30, октябрь начался
check(
  "после 19:00 UTC 30 сентября в Ташкенте уже октябрь",
  currentMonthKey(new Date("2026-09-30T19:30:00Z")),
  "2026-10"
);
// 2026-09-30T18:59:00Z — в Ташкенте ещё 2026-09-30T23:59, сентябрь не кончился
check(
  "до 19:00 UTC 30 сентября в Ташкенте ещё сентябрь",
  currentMonthKey(new Date("2026-09-30T18:59:00Z")),
  "2026-09"
);
check(
  "isClosedMonth использует ташкентский месяц, а не UTC",
  isClosedMonth("2026-09", new Date("2026-09-30T19:30:00Z")),
  true
);

// ── сегодняшняя дата по Ташкенту (для дашборда ученика/родителя) ──
check(
  "после 19:00 UTC в Ташкенте уже следующий день",
  currentDateKey(new Date("2026-09-30T19:30:00Z")),
  "2026-10-01"
);
check(
  "до 19:00 UTC в Ташкенте ещё тот же день",
  currentDateKey(new Date("2026-09-30T18:59:00Z")),
  "2026-09-30"
);

const computed: MonthCharge[] = [
  { month: "2026-09", charge: { amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 } },
  { month: "2026-10", charge: { amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 } },
];
const frozen: StoredCharge[] = [
  { month: "2026-09", amount: 500000, basis: "full", unitsTotal: 1, unitsBilled: 1 },
  { month: "2026-10", amount: 500000, basis: "full", unitsTotal: 1, unitsBilled: 1 },
];

check(
  "закрытый месяц берётся из реестра, открытый пересчитывается",
  mergeSchedule(computed, frozen, NOW).map((m) => [m.month, m.charge.amount]),
  [["2026-09", 500000], ["2026-10", 650000]]
);
check(
  "без реестра всё считается формулой",
  mergeSchedule(computed, [], NOW).map((m) => [m.month, m.charge.amount]),
  [["2026-09", 650000], ["2026-10", 650000]]
);
check(
  "зафиксированный месяц не теряется, даже если выпал из расчёта",
  mergeSchedule(
    [{ month: "2026-10", charge: { amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 } }],
    [{ month: "2026-08", amount: 300000, basis: "lessons", unitsTotal: 13, unitsBilled: 6 }],
    NOW
  ).map((m) => [m.month, m.charge.amount]),
  [["2026-08", 300000], ["2026-10", 650000]]
);
check(
  "цена, изменённая в октябре, не переписывает закрытый сентябрь",
  mergeSchedule(
    chargeSchedule({ ...base, startsAt: utc("2026-09-01"), priceOverride: 900000 }, "2026-10"),
    [{ month: "2026-09", amount: 650000, basis: "full", unitsTotal: 1, unitsBilled: 1 }],
    NOW
  ).map((m) => [m.month, m.charge.amount]),
  [["2026-09", 650000], ["2026-10", 900000]]
);

// ── работа с месяцами ──
check("переход через год", addMonths("2026-12", 1), "2027-01");
check("назад через год", addMonths("2026-01", -1), "2025-12");
check("диапазон", monthRange("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
check("пустой диапазон", monthRange("2026-05", "2026-04"), []);
check("месяц даты", monthKey(utc("2026-07-25")), "2026-07");
check("платёж без периода → месяц приёма", paymentMonth({ forMonth: null, paidAt: utc("2026-08-03") }), "2026-08");
check("платёж с периодом → указанный", paymentMonth({ forMonth: "2026-07", paidAt: utc("2026-08-03") }), "2026-07");

});
