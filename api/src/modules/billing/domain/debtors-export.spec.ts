import { describe, expect, it } from "vitest";
import * as XLSX from "@e965/xlsx";
import { buildDebtorsWorkbook, type DebtorExportRow } from "./debtors-export";

const teacherA = { id: "t1", firstName: "Анвар", lastName: "Алиев" };
const teacherB = { id: "t2", firstName: "Бобур", lastName: "Беков" };

function row(over: Partial<DebtorExportRow> & { name: string; debt: number }): DebtorExportRow {
  const { name, ...rest } = over;
  return {
    student: { firstName: name, lastName: "Тестов", phone: null, telegramUsername: null },
    course: { id: "c1", title: "Python" },
    group: { id: "g1", name: "Группа А" },
    teacher: teacherA,
    monthlyPrice: 500000,
    charged: over.debt + 100000,
    paid: 100000,
    ...rest,
  };
}

const rows: DebtorExportRow[] = [
  row({ name: "Малый", debt: 100000 }),
  row({ name: "Большой", debt: 300000, student: { firstName: "Большой", lastName: "Тестов", phone: "+998901", telegramUsername: "big" } }),
  row({ name: "Б1", debt: 200000, group: { id: "g2", name: "Группа Б" }, teacher: teacherB }),
  row({ name: "Без", debt: 50000, group: null, teacher: null }),
];

const aoa = (wb: XLSX.WorkBook, name: string) =>
  XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: true });

describe("выгрузка должников", () => {
  const wb = buildDebtorsWorkbook(rows, "2026-10", "ru");

  it("три листа с русскими названиями", () => {
    expect(wb.SheetNames).toEqual(["По группам", "По учителям", "Все должники"]);
  });

  it("лист по группам: блоки по учителю, долг по убыванию, итоги, суммы числами", () => {
    const data = aoa(wb, "По группам");
    expect(data[0][0]).toBe("Должники на октябрь 2026");
    const heads = data.filter((r) => typeof r[0] === "string" && (r[0] as string).startsWith("Группа:"));
    expect(heads.map((r) => r[0])).toEqual([
      "Группа: Группа А | Курс: Python | Учитель: Алиев Анвар",
      "Группа: Группа Б | Курс: Python | Учитель: Беков Бобур",
    ]);
    const first = data.findIndex((r) => r[0] === heads[0][0]);
    expect(data[first + 2][1]).toBe("Тестов Большой");
    expect(data[first + 2][7]).toBe(300000);
    expect(data[first + 3][1]).toBe("Тестов Малый");
    expect(data[first + 4][1]).toBe("Итого по группе (2 уч.)");
    expect(data[first + 4][7]).toBe(400000);
    expect(data.some((r) => r[0] === "Без группы")).toBe(true);
    const total = data[data.length - 1];
    expect(total[1]).toBe("ИТОГО (4 уч.)");
    expect(total[7]).toBe(650000);
  });

  it("лист по учителям: по убыванию долга, «Без учителя», итого", () => {
    const data = aoa(wb, "По учителям");
    expect(data[3].slice(0, 6)).toEqual(["Алиев Анвар", 1, 2, 600000, 200000, 400000]);
    expect(data.map((r) => r[0]).slice(3)).toEqual(["Алиев Анвар", "Беков Бобур", "Без учителя", "ИТОГО"]);
    expect(data[data.length - 1][5]).toBe(650000);
  });

  it("плоский лист: автофильтр и сортировка по долгу", () => {
    const sheet = wb.Sheets["Все должники"];
    expect(sheet["!autofilter"]).toBeDefined();
    expect(sheet["!cols"]?.length).toBe(10);
    const data = aoa(wb, "Все должники");
    expect(data.slice(2).map((r) => r[9])).toEqual([300000, 200000, 100000, 50000]);
    expect(data[2][5]).toBe("@big");
  });
});

describe("выгрузка должников на узбекском", () => {
  const wb = buildDebtorsWorkbook(rows, "2026-10", "uz");

  it("листы, заголовок, шапки и итоги на узбекском", () => {
    expect(wb.SheetNames).toEqual(["Guruhlar bo'yicha", "O'qituvchilar bo'yicha", "Barcha qarzdorlar"]);
    const groups = aoa(wb, "Guruhlar bo'yicha");
    expect(groups[0][0]).toBe("Qarzdorlar: oktabr 2026");
    expect(groups[2][0]).toBe("Guruh: Группа А | Kurs: Python | O'qituvchi: Алиев Анвар");
    expect(groups[3]).toEqual(["№", "Talaba", "Telefon", "Telegram", "Oylik narx", "Hisoblangan", "To'langan", "Qarz"]);
    expect(groups.some((r) => r[0] === "Guruhsiz")).toBe(true);
    expect(groups[groups.length - 1][1]).toBe("JAMI (4 ta talaba)");

    const teachers = aoa(wb, "O'qituvchilar bo'yicha");
    // «O'qituvchisiz» по-прежнему в конце, перед итогом
    expect(teachers.map((r) => r[0]).slice(3)).toEqual(["Алиев Анвар", "Беков Бобур", "O'qituvchisiz", "JAMI"]);

    const flat = aoa(wb, "Barcha qarzdorlar");
    expect(flat[1][0]).toBe("O'qituvchi");
    expect(flat.slice(2).map((r) => r[9])).toEqual([300000, 200000, 100000, 50000]);
  });
});
