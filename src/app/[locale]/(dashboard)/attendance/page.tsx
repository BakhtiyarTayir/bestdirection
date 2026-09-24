import { requireRole } from "@/lib/auth-guard";
import { getAttendanceGroups } from "@/lib/api/attendance.server";
import { getBranches } from "@/lib/api/branches.server";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { Calendar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BranchFilter } from "@/components/branch-filter";
import { TeacherFilter } from "@/components/teacher-filter";
import { MonthFilter } from "@/components/month-filter";
import { AttendanceGroupsList } from "./attendance-groups-list";

export const dynamic = "force-dynamic";

interface AttendancePageProps {
  searchParams: Promise<{ branchId?: string; teacherId?: string; month?: string }>;
}

/**
 * Раздел «Посещаемость» (план «Журнал посещаемости по группам», п.3): вместо
 * списка курсов — список групп, у каждой свой журнал. Страница полезна
 * только персоналу — у ученика своего журнала отсюда нет (сам отмечать
 * некого, а смотреть свою посещаемость эта страница пока не умеет).
 */
export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const t = await getTranslations("attendance");
  const { branchId, teacherId, month } = await searchParams;

  const [groupsResult, branchesResult, teachersResult] = await Promise.all([
    getAttendanceGroups({ branchId, teacherId, month }),
    getBranches(),
    // Фильтр по преподавателю — только администратору: преподаватель и так
    // видит только свои группы
    session.user.role === "ADMIN" ? getTeacherOptions() : Promise.resolve(null),
  ]);

  const groups = groupsResult.success ? groupsResult.data : [];
  const branches = branchesResult.success && branchesResult.data ? branchesResult.data : [];
  const teachers = teachersResult?.success ? teachersResult.data : [];
  // Месяц по умолчанию — текущий, тот же, что берёт api без параметра;
  // без него input[type=month] остался бы пустым при первом заходе
  const effectiveMonth = month ?? new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="h-8 w-8" />
        <h1 className="text-3xl font-bold">{t("title")}</h1>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <MonthFilter month={effectiveMonth} namespace="attendance" />
        <BranchFilter branchId={branchId} branches={branches} namespace="attendance" />
        {teachers.length > 0 && (
          <TeacherFilter teacherId={teacherId} teachers={teachers} namespace="attendance" />
        )}
      </div>

      <AttendanceGroupsList groups={groups} resetKey={`${effectiveMonth}|${branchId ?? ""}|${teacherId ?? ""}`} />
    </div>
  );
}
