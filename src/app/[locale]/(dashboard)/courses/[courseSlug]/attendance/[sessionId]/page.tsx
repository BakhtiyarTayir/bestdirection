import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getEnrolledStudents, getCourseById } from "@/lib/api/courses.server";
import { getAttendanceSessions } from "@/lib/api/attendance.server";
import { getTeacherOptions } from "@/lib/api/groups.server";
import { AttendanceMarking } from "@/components/attendance-marking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { DeleteSessionButton } from "./delete-session-button";
import { formatFullDate } from "@/lib/format-date";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface SessionPageProps {
  params: Promise<{ courseSlug: string; sessionId: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const t = await getTranslations("attendance");
  const locale = await getLocale();
  const authSession = await getSession();
  if (!authSession?.user) redirect("/login");

  const { courseSlug, sessionId } = await params;
  const courseId = await resolveCourseSlug(courseSlug);

  const role = authSession.user.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect("/dashboard");
  }

  const [courseResult, sessionsResult] = await Promise.all([
    getCourseById(courseId),
    getAttendanceSessions(courseId),
  ]);

  if (!courseResult.success || !courseResult.data) {
    redirect("/dashboard");
  }

  const course = courseResult.data;
  const allSessions = sessionsResult.success ? sessionsResult.data ?? [] : [];

  const currentSession = allSessions.find(
    (s: { id: string }) => s.id === sessionId
  );

  if (!currentSession) {
    redirect(`/courses/${courseSlug}/attendance`);
  }

  // Ученики только той группы, на которую заведено занятие: список грузится
  // после того, как занятие найдено. Иначе преподаватель отмечает чужих детей —
  // в форме у всех по умолчанию «присутствует», и одно сохранение проставляет
  // присутствие ученикам других групп курса.
  const studentsResult = await getEnrolledStudents(
    courseId,
    currentSession.groupId ?? undefined
  );
  const students = studentsResult.success ? studentsResult.data ?? [] : [];

  // Ведущего занятия меняет только администратор — например, при замене
  const canChangeTeacher = role === "ADMIN";
  const teachersResult = canChangeTeacher ? await getTeacherOptions() : null;
  const teacherOptions = teachersResult?.success ? teachersResult.data : [];

  const existingRecords = currentSession.records ?? [];

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
        <DeleteSessionButton
          sessionId={sessionId}
          courseSlug={courseSlug}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {formatFullDate(currentSession.date, locale)}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Чьё это занятие: по этой же группе сужен список учеников */}
              <Badge variant="outline">
                {currentSession.group?.name ?? t("allGroups")}
              </Badge>
              {currentSession.note && (
                <Badge variant="secondary">{currentSession.note}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AttendanceMarking
            sessionId={sessionId}
            students={students}
            existingRecords={existingRecords}
            teacher={currentSession.teacher}
            teacherStatus={currentSession.teacherStatus}
            teacherNote={currentSession.teacherNote}
            canChangeTeacher={canChangeTeacher}
            teacherOptions={teacherOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
