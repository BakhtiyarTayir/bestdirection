/**
 * Проверка расчёта начислений: npx tsx scripts/check-billing.ts
 *
 * Тестового раннера в проекте нет, а математика биллинга — самое рискованное
 * место в оплатах: ошибка здесь означает неверные долги у живых студентов.
 * Скрипт падает с ненулевым кодом, если хоть одна проверка не сошлась.
 */
import {
  chargeForMonth,
  chargeSchedule,
  totalCharged,
  countLessons,
  monthRange,
  addMonths,
  monthKey,
  paymentMonth,
  type BillingEnrollment,
} from "../src/lib/billing";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? ` = ${a}` : `\n       ожидалось ${e}\n       получено  ${a}`}`);
}

const utc = (s: string) => new Date(`${s}T12:00:00.000Z`);

const base: BillingEnrollment = {
  startsAt: null,
  createdAt: utc("2026-07-25"),
  billingEndsAt: null,
  priceOverride: null,
  firstMonthCharge: null,
  coursePrice: 650000,
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

console.log("\n── первый неполный месяц ──");
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

console.log("\n── дата начала группы ──");
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

console.log("\n── ручная правка суммы админом ──");
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

console.log("\n── уход и пауза ──");
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

console.log("\n── цена ──");
check(
  "priceOverride вместо цены курса",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), priceOverride: 400000 }, "2026-08").amount,
  400000
);
check(
  "курс без цены не биллится",
  chargeForMonth({ ...base, startsAt: utc("2026-07-01"), coursePrice: null }, "2026-08").basis,
  "none"
);

console.log("\n── группа без расписания ──");
check(
  "фолбэк на дни: 7 из 31",
  chargeForMonth({ ...base, scheduleDays: [], startsAt: utc("2026-07-25") }, "2026-07"),
  { amount: Math.round((650000 * 7) / 31), basis: "days", unitsTotal: 31, unitsBilled: 7 }
);

console.log("\n── накопительный итог ──");
const student: BillingEnrollment = { ...base, scheduleDays: TTS, startsAt: utc("2026-07-25") };
check(
  "разбивка июль–сентябрь",
  chargeSchedule(student, "2026-09").map((m) => [m.month, m.charge.amount]),
  [["2026-07", 150000], ["2026-08", 650000], ["2026-09", 650000]]
);
check("начислено всего к сентябрю", totalCharged(student, "2026-09"), 1450000);

console.log("\n── работа с месяцами ──");
check("переход через год", addMonths("2026-12", 1), "2027-01");
check("назад через год", addMonths("2026-01", -1), "2025-12");
check("диапазон", monthRange("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
check("пустой диапазон", monthRange("2026-05", "2026-04"), []);
check("месяц даты", monthKey(utc("2026-07-25")), "2026-07");
check("платёж без периода → месяц приёма", paymentMonth({ forMonth: null, paidAt: utc("2026-08-03") }), "2026-08");
check("платёж с периодом → указанный", paymentMonth({ forMonth: "2026-07", paidAt: utc("2026-08-03") }), "2026-07");

console.log(failed === 0 ? "\n✅ все проверки пройдены" : `\n❌ провалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
