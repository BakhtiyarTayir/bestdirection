import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { getEnrolledStudents, getCourseById } from "@/actions/course-actions";
import { getAttendanceSessions } from "@/actions/attendance-actions";
import { AttendanceMarking } from "@/components/attendance-marking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { DeleteSessionButton } from "./delete-session-button";
import { formatFullDate } from "@/lib/format-date";
import { useTranslations } from "next-intl";

interface SessionPageProps {
  params: Promise<{ courseId: string; sessionId: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const t = useTranslations("attendance");
  const authSession = await auth();
  if (!authSession?.user) redirect("/login");

  const { courseId, sessionId } = await params;

  const role = authSession.user.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect("/dashboard");
  }

  const [courseResult, studentsResult, sessionsResult] = await Promise.all([
    getCourseById(courseId),
    getEnrolledStudents(courseId),
    getAttendanceSessions(courseId),
  ]);

  if (!courseResult.success || !courseResult.data) {
    redirect("/dashboard");
  }

  const course = courseResult.data;
  const students = studentsResult.success ? studentsResult.data ?? [] : [];
  const allSessions = sessionsResult.success ? sessionsResult.data ?? [] : [];

  const currentSession = allSessions.find(
    (s: { id: string }) => s.id === sessionId
  );

  if (!currentSession) {
    redirect(`/courses/${courseId}/attendance`);
  }

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
          courseId={courseId}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {formatFullDate(currentSession.date)}
            </CardTitle>
            {currentSession.note && (
              <Badge variant="secondary">{currentSession.note}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <AttendanceMarking
            sessionId={sessionId}
            students={students}
            existingRecords={existingRecords}
          />
        </CardContent>
      </Card>
    </div>
  );
}
