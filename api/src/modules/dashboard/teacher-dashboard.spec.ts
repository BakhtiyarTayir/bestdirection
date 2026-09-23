import { describe, expect, it } from "vitest";
import { buildSchedule, dateKeyOf, toDdMm, unmarkedThisMonth } from "./teacher-dashboard.service";

// Расписание преподавателя — чистая функция, даты передаются явно, поэтому
// здесь удобно проверить граничные случаи, которые в e2e-тесте зависят от
// реальной даты запуска и не гарантированы: неделя, задевающая соседний
// месяц, отработка вне расписания, прошедшее занятие без отметки.
describe("buildSchedule", () => {
  const group = (overrides: Partial<Parameters<typeof buildSchedule>[0][number]> = {}) => ({
    groupId: "g1",
    groupName: "Группа",
    courseId: "c1",
    courseTitle: "Курс",
    courseSlug: "kurs",
    branchId: "b1",
    branchName: "Филиал",
    schedule: "Пн/Ср 18:00",
    scheduleDays: [1, 3],
    startDateKey: null,
    endDateKey: null,
    ...overrides,
  });

  it("неделя, задевающая соседний месяц: дни за пределами месяца тоже попадают в диапазон", () => {
    // 2026-09-28 (понедельник) — 2026-10-04 (воскресенье): неделя целиком в
    // сентябре и октябре разом. Диапазон строит вызывающий (summary()), здесь
    // просто передаём его явно
    const days = buildSchedule([group()], new Map(), "2026-09-28", "2026-10-04", "2026-10-01");
    const dates = days.map((d) => d.date);
    expect(dates[0]).toBe("2026-09-28");
    expect(dates.at(-1)).toBe("2026-10-04");
    expect(dates.some((d) => d.startsWith("2026-09"))).toBe(true);
    expect(dates.some((d) => d.startsWith("2026-10"))).toBe(true);
  });

  it("отработка: отметка в журнале на день вне расписания группы помечена isMakeup", () => {
    // Группа занимается по пн/ср (scheduleDays [1,3]); отметка на вторник —
    // явно вне расписания, значит отработка
    const sessions = new Map([["g1", new Set(["2026-09-29"])]]); // вторник
    const days = buildSchedule([group()], sessions, "2026-09-28", "2026-09-30", "2026-09-30");
    const tuesday = days.find((d) => d.date === "2026-09-29")!;
    expect(tuesday.lessons).toHaveLength(1);
    expect(tuesday.lessons[0]).toMatchObject({ marked: true, isMakeup: true });
  });

  it("прошедшее плановое занятие без отметки в журнале — «не отмечено», будущее — без пометки", () => {
    // Понедельник (28-е) — плановый день в прошлом без сессии; среда (30-е) —
    // плановый день в будущем относительно todayKey=2026-09-28
    const days = buildSchedule([group()], new Map(), "2026-09-28", "2026-09-30", "2026-09-28");
    const monday = days.find((d) => d.date === "2026-09-28")!;
    const wednesday = days.find((d) => d.date === "2026-09-30")!;
    expect(monday.lessons[0]).toMatchObject({ marked: false, isMakeup: false });
    expect(wednesday.lessons[0]).toMatchObject({ marked: null, isMakeup: false });
  });

  it("startDate/endDate группы ограничивают, когда занятие вообще планируется", () => {
    const limited = group({ startDateKey: "2026-09-29", endDateKey: "2026-09-29" });
    const days = buildSchedule([limited], new Map(), "2026-09-28", "2026-09-30", "2026-09-30");
    // 28-е (пн) — до начала группы, 30-е (ср) — уже после конца: занятий нет,
    // остаётся только 29-е, но оно вторник — вне scheduleDays [1,3] группы
    expect(days.every((d) => d.lessons.length === 0)).toBe(true);
  });
});

describe("unmarkedThisMonth", () => {
  it("собирает даты DD.MM по группам, только текущий месяц и только неотмеченные плановые занятия", () => {
    const days = buildSchedule(
      [
        {
          groupId: "g1",
          groupName: "Группа 1",
          courseId: "c1",
          courseTitle: "Курс",
          courseSlug: "kurs",
          branchId: "b1",
          branchName: "Филиал",
          schedule: null,
          scheduleDays: [1],
          startDateKey: null,
          endDateKey: null,
        },
      ],
      new Map(),
      "2026-08-31",
      "2026-09-07",
      "2026-09-07"
    );
    const result = unmarkedThisMonth(days, "2026-09");
    expect(result).toHaveLength(1);
    // 2026-08-31 — понедельник, но это август, не должен попасть; 2026-09-07 — тоже понедельник, сентябрь
    expect(result[0].dates).toEqual(["07.09"]);
  });
});

describe("toDdMm / dateKeyOf", () => {
  it("форматирует туда-обратно без потери дня", () => {
    expect(toDdMm("2026-01-05")).toBe("05.01");
    expect(dateKeyOf(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026-12-31");
  });
});
