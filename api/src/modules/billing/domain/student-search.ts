/**
 * Поиск ученика по строке из фильтра: имя, фамилия или телефон (подстрока,
 * без учёта регистра). Несколько слов — AND по словам, OR по полям: каждое
 * слово должно найтись хотя бы в одном поле, поэтому «Ibragimov Muhammad» и
 * «Muhammad Ibragimov» дают одно и то же. Одно правило на журнал оплат
 * (Prisma where) и на должников (в памяти) — чтобы экраны не расходились.
 */

export interface SearchableStudent {
  firstName: string;
  lastName: string;
  phone: string | null;
}

/** Слова поискового запроса; пустая строка — фильтра нет (пустой массив) */
export function searchWords(q: string | undefined | null): string[] {
  return (q ?? "").trim().split(/\s+/).filter(Boolean);
}

/** Условие Prisma для User (или relation student) по тем же правилам */
export function studentSearchWhere(q: string | undefined | null) {
  return searchWords(q).map((word) => ({
    OR: [
      { firstName: { contains: word, mode: "insensitive" as const } },
      { lastName: { contains: word, mode: "insensitive" as const } },
      { phone: { contains: word, mode: "insensitive" as const } },
    ],
  }));
}

/** То же сопоставление в памяти — для списка должников */
export function matchesStudentSearch(student: SearchableStudent, q: string | undefined | null): boolean {
  const fields = [student.firstName, student.lastName, student.phone ?? ""].map((value) => value.toLowerCase());
  return searchWords(q).every((word) => {
    const needle = word.toLowerCase();
    return fields.some((field) => field.includes(needle));
  });
}
