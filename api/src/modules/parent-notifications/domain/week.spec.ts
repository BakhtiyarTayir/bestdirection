import { describe, expect, it } from "vitest";
import { previousWeek, weekDateRange } from "./week";

// Прошедшая неделя — чистая функция от "сейчас", датой управляем явно вместо
// реального Date.now(): иначе тест зависел бы от дня запуска.
describe("previousWeek", () => {
  it("понедельник 04:00 UTC (09:00 Ташкент, момент запуска cron) — прошлая неделя пн-вс закончилась вчера", () => {
    // 2026-09-28 — понедельник
    const now = new Date("2026-09-28T04:00:00.000Z");
    const week = previousWeek(now);

    expect(week.fromDateKey).toBe("2026-09-21"); // понедельник прошлой недели
    expect(week.toDateKey).toBe("2026-09-27"); // воскресенье прошлой недели
    expect(week.weekKey).toBe("2026-09-21");
  });

  it("границы для DateTime-полей — реальные UTC-моменты начала/конца недели по Ташкенту", () => {
    const now = new Date("2026-09-28T04:00:00.000Z");
    const week = previousWeek(now);

    // Понедельник 00:00 по Ташкенту (UTC+5) — это воскресенье 19:00 UTC
    expect(week.fromInstant.toISOString()).toBe("2026-09-20T19:00:00.000Z");
    // Следующий понедельник 00:00 по Ташкенту — граница ИСКЛЮЧАЯ
    expect(week.toInstantExclusive.toISOString()).toBe("2026-09-27T19:00:00.000Z");
  });

  it("середина недели (не понедельник) — откатывается к ближайшему прошлому понедельнику, не падает", () => {
    // 2026-09-30 — среда той же недели, что и первый тест
    const now = new Date("2026-09-30T10:00:00.000Z");
    const week = previousWeek(now);

    expect(week.fromDateKey).toBe("2026-09-21");
    expect(week.toDateKey).toBe("2026-09-27");
  });

  it("weekDateRange — границы дня для запроса по @db.Date полю", () => {
    const week = previousWeek(new Date("2026-09-28T04:00:00.000Z"));
    const range = weekDateRange(week);
    expect(range.gte.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(range.lte.toISOString().slice(0, 10)).toBe("2026-09-27");
  });
});
