import * as XLSX from "@e965/xlsx";

/** Минимум полей строки должника, нужных для выгрузки (подмножество ответа debtors()). */
export interface DebtorExportRow {
  student: { firstName: string; lastName: string; phone: string | null; telegramUsername: string | null };
  course: { id: string; title: string };
  group: { id: string; name: string } | null;
  teacher: { id: string; firstName: string; lastName: string } | null;
  monthlyPrice: number;
  charged: number;
  paid: number;
  debt: number;
}

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

const NO_TEACHER = "Без учителя";
const NO_GROUP = "Без группы";

/** «2026-10» → «октябрь 2026». Нераспознанное значение отдаём как есть. */
function monthTitle(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const name = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return name ? `${name} ${match![1]}` : month;
}

const collator = new Intl.Collator("ru");
const byText = (a: string, b: string) => collator.compare(a, b);

const teacherName = (row: DebtorExportRow) =>
  row.teacher ? `${row.teacher.lastName} ${row.teacher.firstName}`.trim() : NO_TEACHER;
const studentName = (row: DebtorExportRow) => `${row.student.lastName} ${row.student.firstName}`.trim();
const telegram = (row: DebtorExportRow) => (row.student.telegramUsername ? `@${row.student.telegramUsername}` : "");
const sum = (rows: DebtorExportRow[], key: "charged" | "paid" | "debt") =>
  rows.reduce((total, row) => total + row[key], 0);

// Учитель «Без учителя» всегда в конце, остальные по алфавиту
function compareTeachers(a: string, b: string) {
  if (a === b) return 0;
  if (a === NO_TEACHER) return 1;
  if (b === NO_TEACHER) return -1;
  return byText(a, b);
}

type Cell = string | number;

function finishSheet(rows: Cell[][], cols: number[], extra: Partial<XLSX.WorkSheet> = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = cols.map((wch) => ({ wch }));
  Object.assign(sheet, extra);
  return sheet;
}

function groupsSheet(rows: DebtorExportRow[], title: string) {
  const out: Cell[][] = [[title], []];
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
  const header = ["№", "Ученик", "Телефон", "Telegram", "Цена в месяц", "Начислено", "Оплачено", "Долг"];

  const withGroup = new Map<string, DebtorExportRow[]>();
  const withoutGroup: DebtorExportRow[] = [];
  for (const row of rows) {
    if (!row.group) {
      withoutGroup.push(row);
      continue;
    }
    const list = withGroup.get(row.group.id) ?? [];
    list.push(row);
    withGroup.set(row.group.id, list);
  }

  const blocks = [...withGroup.values()].sort(
    (a, b) =>
      compareTeachers(teacherName(a[0]), teacherName(b[0])) || byText(a[0].group!.name, b[0].group!.name)
  );

  const pushBlock = (label: string, list: DebtorExportRow[], withOwner: boolean) => {
    merges.push({ s: { r: out.length, c: 0 }, e: { r: out.length, c: 7 } });
    out.push([label]);
    out.push(header);
    [...list]
      .sort((a, b) => b.debt - a.debt)
      .forEach((row, index) => {
        // У записей без группы курс и учитель свои — дописываем к имени
        const name = withOwner
          ? `${studentName(row)} (${row.course.title}; ${teacherName(row)})`
          : studentName(row);
        out.push([
          index + 1,
          name,
          row.student.phone ?? "",
          telegram(row),
          row.monthlyPrice,
          row.charged,
          row.paid,
          row.debt,
        ]);
      });
    out.push([
      "",
      withOwner ? `Итого, без группы (${list.length} уч.)` : `Итого по группе (${list.length} уч.)`,
      "",
      "",
      "",
      sum(list, "charged"),
      sum(list, "paid"),
      sum(list, "debt"),
    ]);
    out.push([]);
  };

  for (const list of blocks) {
    const first = list[0];
    pushBlock(
      `Группа: ${first.group!.name} | Курс: ${first.course.title} | Учитель: ${teacherName(first)}`,
      list,
      false
    );
  }
  if (withoutGroup.length > 0) pushBlock(NO_GROUP, withoutGroup, true);

  out.push(["", `ИТОГО (${rows.length} уч.)`, "", "", "", sum(rows, "charged"), sum(rows, "paid"), sum(rows, "debt")]);
  return finishSheet(out, [5, 42, 18, 18, 14, 14, 14, 14], { "!merges": merges });
}

function teachersSheet(rows: DebtorExportRow[], title: string) {
  const byTeacher = new Map<string, DebtorExportRow[]>();
  for (const row of rows) {
    const key = teacherName(row);
    const list = byTeacher.get(key) ?? [];
    list.push(row);
    byTeacher.set(key, list);
  }
  const lines = [...byTeacher.entries()]
    .map(([name, list]) => ({
      name,
      groups: new Set(list.filter((r) => r.group).map((r) => r.group!.id)).size,
      count: list.length,
      charged: sum(list, "charged"),
      paid: sum(list, "paid"),
      debt: sum(list, "debt"),
    }))
    .sort((a, b) => b.debt - a.debt || byText(a.name, b.name));

  const out: Cell[][] = [
    [title],
    [],
    ["Учитель", "Групп с должниками", "Должников", "Начислено", "Оплачено", "Долг"],
    ...lines.map((l) => [l.name, l.groups, l.count, l.charged, l.paid, l.debt]),
    [
      "ИТОГО",
      lines.reduce((t, l) => t + l.groups, 0),
      rows.length,
      sum(rows, "charged"),
      sum(rows, "paid"),
      sum(rows, "debt"),
    ],
  ];
  return finishSheet(out, [32, 20, 12, 14, 14, 14], {
    "!merges": [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }],
  });
}

function flatSheet(rows: DebtorExportRow[], title: string) {
  const out: Cell[][] = [
    [title],
    ["Учитель", "Группа", "Курс", "Ученик", "Телефон", "Telegram", "Цена в месяц", "Начислено", "Оплачено", "Долг"],
    ...[...rows]
      .sort((a, b) => b.debt - a.debt)
      .map((row) => [
        teacherName(row),
        row.group?.name ?? NO_GROUP,
        row.course.title,
        studentName(row),
        row.student.phone ?? "",
        telegram(row),
        row.monthlyPrice,
        row.charged,
        row.paid,
        row.debt,
      ]),
  ];
  return finishSheet(out, [28, 22, 24, 30, 18, 18, 14, 14, 14, 14], {
    // Фильтр на шапке таблицы (вторая строка), а не на заголовке с месяцем
    "!autofilter": { ref: `A2:J${out.length}` },
  });
}

/**
 * Книга «Должники на <месяц>»: три листа от одних и тех же строк. Чистая
 * функция — данные приходят из BillingService.debtors(), поэтому файл
 * совпадает с экраном. Суммы пишутся числами, чтобы Excel мог их считать.
 */
export function buildDebtorsWorkbook(rows: DebtorExportRow[], month: string): XLSX.WorkBook {
  const title = `Должники на ${monthTitle(month)}`;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, groupsSheet(rows, title), "По группам");
  XLSX.utils.book_append_sheet(workbook, teachersSheet(rows, title), "По учителям");
  XLSX.utils.book_append_sheet(workbook, flatSheet(rows, title), "Все должники");
  return workbook;
}
