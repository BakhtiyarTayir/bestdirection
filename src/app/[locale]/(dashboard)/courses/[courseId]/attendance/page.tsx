import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { getCourseById, getEnrolledStudents } from "@/actions/course-actions";
import { getAttendanceSessions } from "@/actions/attendance-actions";
import { AttendanceGrid } from "@/components/attendance-grid";
import { CreateSessionDialog } from "@/components/create-session-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";

interface AttendancePageProps {
  params: Promise<{ courseId: string }>;
}

export default async function AttendancePage({ params }: AttendancePageProps) {
  const t = useTranslations("attendance");
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { courseId } = await params;

  const role = session.user.role;
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
  const sessions = sessionsResult.success && sessionsResult.data ? sessionsResult.data : [];

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
        <CreateSessionDialog courseId={courseId} />
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceGrid
            sessions={sessions}
            students={students}
            courseId={courseId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
