import { botMessages, homeworkStatusWord } from "../../../common/telegram/messages";

export interface DigestHomeworkLine {
  title: string;
  status: "APPROVED" | "REJECTED" | "REVISION";
  /** Готовая строка "80/100" — счёт в разных заданиях разного масштаба, форматирует вызывающий. */
  score: string | null;
}

export interface DigestTestLine {
  title: string;
  percentage: number;
}

export interface DigestInput {
  studentName: string;
  /** "23.09" / "29.09" — уже в формате DD.MM (toDdMm) */
  weekFromDdMm: string;
  weekToDdMm: string;
  attendanceTotal: number;
  attendanceAbsent: number;
  homework: DigestHomeworkLine[];
  tests: DigestTestLine[];
  /** Долг в суммах на конец текущего месяца; 0 или отрицательное — долга нет */
  debtAmount: number;
  /** Уже отформатированная сумма долга ("150 000 so'm") — форматирует вызывающий (валюта одна, но формат числа — не забота текста) */
  debtAmountFormatted: string;
}

/**
 * Текст еженедельной сводки одному родителю про одного ребёнка. Вынесено из
 * weekly-digest.service.ts в чистую функцию — тестируется без Nest и БД
 * (юнит-тест weekly-digest-text.spec.ts).
 */
export function buildWeeklyDigestText(input: DigestInput): string {
  const lines: string[] = [
    botMessages.weeklyDigestHeader(input.studentName, input.weekFromDdMm, input.weekToDdMm),
    "",
    botMessages.weeklyDigestAttendance(input.attendanceTotal, input.attendanceAbsent),
    "",
  ];

  if (input.homework.length > 0) {
    lines.push(botMessages.weeklyDigestHomeworkHeader);
    for (const item of input.homework) {
      lines.push(botMessages.weeklyDigestHomeworkLine(item.title, homeworkStatusWord(item.status), item.score));
    }
  } else {
    lines.push(botMessages.weeklyDigestNoHomework);
  }
  lines.push("");

  if (input.tests.length > 0) {
    lines.push(botMessages.weeklyDigestTestHeader);
    for (const item of input.tests) {
      lines.push(botMessages.weeklyDigestTestLine(item.title, item.percentage));
    }
  } else {
    lines.push(botMessages.weeklyDigestNoTests);
  }

  if (input.debtAmount > 0) {
    lines.push("");
    lines.push(botMessages.weeklyDigestDebt(input.debtAmountFormatted));
  }

  return lines.join("\n");
}
