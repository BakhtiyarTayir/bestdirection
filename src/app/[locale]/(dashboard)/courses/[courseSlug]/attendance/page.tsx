import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getCourseById, getEnrolledStudents } from "@/lib/api/courses.server";
import { getAttendanceSessions } from "@/lib/api/attendance.server";
import { getCourseGroups } from "@/lib/api/groups.server";
import { AttendanceGrid } from "@/components/attendance-grid";
import { CreateSessionDialog } from "@/components/create-session-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { resolveCourseSlug } from "@/lib/slug-resolvers";
import { CourseAttendanceTabs } from "./course-attendance-tabs";

export const dynamic = "force-dynamic";

interface AttendancePageProps {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ group?: string }>;
}

/**
 * Обзор посещаемости курса (план «Журнал посещаемости по группам», п.4):
 * вкладки по группам, в каждой — журнал этой группы (тот же AttendanceGrid,
 * что и на её отдельной странице). Смешанной таблицы «все группы вперемешку»
 * больше нет — у каждой группы свой журнал.
 */
export default async function AttendancePage({ params, searchParams }: AttendancePageProps) {
  const t = await getTranslations("attendance");
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const { courseSlug } = await params;
  const { group: groupParam } = await searchParams;
  const courseId = await resolveCourseSlug(courseSlug);

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect("/dashboard");
  }

  const [courseResult, groupsResult] = await Promise.all([getCourseById(courseId), getCourseGroups(courseId)]);

  if (!courseResult.success || !courseResult.data) {
    redirect("/dashboard");
  }
  const course = courseResult.data;

  // Педагогу без доступа к курсу целиком показываем только те группы, где он
  // сам ведущий — та же лестница, что и в правах на журнал (canManageCourseAttendance):
  // иначе вкладка звала бы к чужому журналу, который всё равно отдаст 404
  const allGroups = groupsResult.success ? groupsResult.data : [];
  const visibleGroups =
    role === "ADMIN" || course.teacherId === session.user.id
      ? allGroups
      : allGroups.filter((group) => group.teacherId === session.user.id);

  // Курс без групп (на проде таких нет, план просит не ломать) — прежняя
  // единая таблица без вкладок и без обязательной группы у занятия
  if (visibleGroups.length === 0) {
    const [sessionsResult, studentsResult] = await Promise.all([
      getAttendanceSessions(courseId),
      getEnrolledStudents(courseId),
    ]);
    const sessions = sessionsResult.success ? sessionsResult.data ?? [] : [];
    const students = studentsResult.success ? studentsResult.data ?? [] : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Calendar className="h-8 w-8" />
              {t("title")}
            </h1>
            <p className="text-muted-foreground mt-1">{course.title}</p>
          </div>
          <CreateSessionDialog courseId={courseId} courseSlug={courseSlug} />
        </div>
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

  const groupsData = await Promise.all(
    visibleGroups.map(async (group) => {
      const [sessionsResult, studentsResult] = await Promise.all([
        getAttendanceSessions(courseId, group.id),
        getEnrolledStudents(courseId, group.id),
      ]);
      return {
        id: group.id,
        name: group.name,
        sessions: sessionsResult.success ? sessionsResult.data ?? [] : [],
        students: studentsResult.success ? studentsResult.data ?? [] : [],
      };
    })
  );

  const initialGroupId =
    groupParam && groupsData.some((group) => group.id === groupParam) ? groupParam : groupsData[0].id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calendar className="h-8 w-8" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1">{course.title}</p>
      </div>
      <Separator />
      <CourseAttendanceTabs
        courseId={courseId}
        courseSlug={courseSlug}
        groups={groupsData}
        initialGroupId={initialGroupId}
      />
    </div>
  );
}
