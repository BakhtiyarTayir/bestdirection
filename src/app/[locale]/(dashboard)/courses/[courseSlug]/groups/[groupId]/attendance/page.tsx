import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEnrolledStudents } from "@/lib/api/courses.server";
import { getAttendanceGroups, getAttendanceSessions } from "@/lib/api/attendance.server";
import { getGroupDetails } from "@/lib/api/groups.server";
import { AttendanceGrid } from "@/components/attendance-grid";
import { CreateSessionDialog } from "@/components/create-session-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface GroupAttendancePageProps {
  params: Promise<{ courseSlug: string; groupId: string }>;
}

/**
 * Журнал одной группы (план «Журнал посещаемости по группам», п.2): занятия
 * и отметки только этой группы — у каждой группы теперь свой журнал, а не
 * общая таблица курса. Тот же AttendanceGrid, что и на вкладке курса
 * (раздел 4 плана) — компонент таблицы один на оба места.
 */
export default async function GroupAttendancePage({ params }: GroupAttendancePageProps) {
  const t = await getTranslations("attendance");
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const { courseSlug, groupId } = await params;
  const courseId = await resolveCourseSlug(courseSlug);

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect("/dashboard");
  }

  const groupResult = await getGroupDetails(groupId);
  // Группа не найдена или принадлежит другому курсу — адрес нечестный
  if (!groupResult.success || !groupResult.data || groupResult.data.courseId !== courseId) {
    notFound();
  }
  const group = groupResult.data;

  const [sessionsResult, studentsResult, overviewResult] = await Promise.all([
    getAttendanceSessions(courseId, groupId),
    getEnrolledStudents(courseId, groupId),
    getAttendanceGroups({ groupId }),
  ]);

  // Педагог чужой группы: sessions() отдаёт 404 — без доступа к занятиям
  // показывать журнал бессмысленно
  if (!sessionsResult.success) notFound();

  const sessions = sessionsResult.data ?? [];
  const students = studentsResult.success ? studentsResult.data ?? [] : [];
  const overview = overviewResult.success ? overviewResult.data[0] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Calendar className="h-8 w-8" />
            {group.name}
          </h1>
          <p className="text-muted-foreground mt-1">{group.course.title}</p>
        </div>
        <CreateSessionDialog
          courseId={courseId}
          courseSlug={courseSlug}
          fixedGroup={{ id: groupId, name: group.name }}
        />
      </div>

      {overview && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="font-medium">
            {t("markedOfMonth", { marked: overview.markedLessons, total: overview.plannedLessons })}
          </p>
          <p className="text-sm text-muted-foreground">{t("salaryFullMonthHint")}</p>
        </div>
      )}

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceGrid sessions={sessions} students={students} courseSlug={courseSlug} />
        </CardContent>
      </Card>
    </div>
  );
}
