import { requireRole } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getSalaryGroupStudentsServer, getTeacherSalary } from "@/lib/api/salary.server";
import type { ApiSalaryMonthStudent } from "@/lib/api/salary";
import { TeacherSalaryView } from "./teacher-salary-view";

export const dynamic = "force-dynamic";

interface TeacherSalaryPageProps {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeacherSalaryPage({ params, searchParams }: TeacherSalaryPageProps) {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("salaries");

  const { teacherId } = await params;
  const query = await searchParams;
  const month = typeof query.month === "string" && query.month ? query.month : undefined;

  const result = await getTeacherSalary(teacherId, { month });
  if (!result.success || !result.data) notFound();
  const { teacher, groups, adjustments, carriedOver, accruedMonth, paidMonth, debt, payouts } = result.data;

  // Один общий список учеников месяца вместо карточек по группам (решение
  // владельца 2026-10-23): собираем учеников всех групп, у которых этот месяц есть
  const monthGroups = groups.filter((group) =>
    group.months.some((row) => row.month === result.data.month && row.studentsCount > 0)
  );
  const studentResults = await Promise.all(
    monthGroups.map((group) => getSalaryGroupStudentsServer(result.data.month, group.groupId, group.courseId))
  );
  const students: ApiSalaryMonthStudent[] = [];
  let studentsIncomplete = false;
  studentResults.forEach((studentsResult, index) => {
    if (!studentsResult.success || !studentsResult.data) {
      studentsIncomplete = true;
      return;
    }
    const group = monthGroups[index];
    const groupLabel = group.groupName
      ? `${group.courseTitle} — ${group.groupName}`
      : `${group.courseTitle} (${t("withoutGroup")})`;
    for (const student of studentsResult.data.students) students.push({ ...student, groupLabel });
  });

  // Закрыт ли месяц — как isClosedMonth в api (месяц по Ташкенту, UTC+5):
  // пересчёт имеет смысл только для закрытого, открытый и так считается по свежим данным
  const tashkentNow = new Date(new Date().getTime() + 5 * 3_600_000).toISOString().slice(0, 7);
  const monthClosed = result.data.month < tashkentNow;
  // Группы, у которых есть строка за выбранный месяц — их и пересчитывает кнопка
  const recalcGroups = monthClosed
    ? groups.flatMap((group) => {
        const row = group.months.find((m) => m.month === result.data.month);
        if (!row) return [];
        return [
          {
            groupId: group.groupId,
            courseId: group.courseId,
            label: group.groupName
              ? `${group.courseTitle} — ${group.groupName}`
              : `${group.courseTitle} (${t("withoutGroup")})`,
            lessonsPlanned: row.lessonsPlanned,
            lessonsTaught: row.lessonsTaught,
            amount: row.amount,
          },
        ];
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {teacher.lastName} {teacher.firstName}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("subtitleTeacher")}</p>
      </div>
      <TeacherSalaryView
        teacherId={teacherId}
        month={result.data.month}
        students={students}
        studentsIncomplete={studentsIncomplete}
        adjustments={adjustments}
        carriedOver={carriedOver}
        accruedMonth={accruedMonth}
        paidMonth={paidMonth}
        debt={debt}
        payouts={payouts}
        recalcGroups={recalcGroups}
      />
    </div>
  );
}
