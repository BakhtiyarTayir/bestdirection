import { requireAuth } from "@/lib/auth-guard";
import { getCourses } from "@/lib/api/courses.server";
import { getAttendanceSessions } from "@/actions/attendance-actions";
import { Link } from "@/i18n/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const session = await requireAuth();
  const role = session.user.role;
  const t = await getTranslations("attendance");
  const tCourses = await getTranslations("courses");

  const result = await getCourses();
  const courses = result.success && result.data ? result.data : [];

  const coursesWithAttendance = await Promise.all(
    courses.map(async (course) => {
      const sessionsResult = await getAttendanceSessions(course.id);
      const sessions =
        sessionsResult.success && sessionsResult.data ? sessionsResult.data : [];
      return { course, sessionCount: sessions.length };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="h-8 w-8" />
        <h1 className="text-3xl font-bold">{t("title")}</h1>
      </div>

      {coursesWithAttendance.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">{t("noCourses")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coursesWithAttendance.map(({ course, sessionCount }) => (
            <Card key={course.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">{course.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  {t("sessionCount", { count: sessionCount })}
                </div>
                <Link href={`/courses/${course.slug}/attendance`}>
                  <Button variant="outline" className="w-full">
                    {role === "STUDENT"
                      ? t("viewAttendance")
                      : t("manageAttendance")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}