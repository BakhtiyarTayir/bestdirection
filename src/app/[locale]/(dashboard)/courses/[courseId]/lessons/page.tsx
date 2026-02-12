import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { getLessons } from "@/actions/lesson-actions";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";
import { LessonList } from "./lesson-list";
import { useTranslations } from "next-intl";

interface LessonsPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function LessonsPage({ params }: LessonsPageProps) {
  const t = useTranslations("lessons");
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { courseId } = await params;
  const result = await getLessons(courseId);

  const isTeacherOrAdmin =
    session.user.role === "ADMIN" || session.user.role === "TEACHER";

  const lessons = result.success ? result.data ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {isTeacherOrAdmin && (
          <Link href={`/courses/${courseId}/lessons/new`}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("createLesson")}
            </Button>
          </Link>
        )}
      </div>

      {!result.success && (
        <p className="text-destructive">{result.error}</p>
      )}

      {result.success && (
        <LessonList
          initialLessons={lessons}
          courseId={courseId}
          isTeacherOrAdmin={isTeacherOrAdmin}
        />
      )}
    </div>
  );
}
