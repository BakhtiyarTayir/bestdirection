import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getLessons } from "@/lib/api/lessons.server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LessonList } from "./lesson-list";
import { getTranslations } from "next-intl/server";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

interface LessonsPageProps {
  params: Promise<{ courseSlug: string }>;
}

export default async function LessonsPage({ params }: LessonsPageProps) {
  const t = await getTranslations("lessons");
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { courseSlug } = await params;
  const courseId = await resolveCourseSlug(courseSlug);
  const result = await getLessons(courseId);

  const isTeacherOrAdmin =
    session.user.role === "ADMIN" || session.user.role === "TEACHER";

  const lessons = result.success ? result.data ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {isTeacherOrAdmin && (
          <Link href={`/courses/${courseSlug}/lessons/new`}>
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
          courseSlug={courseSlug}
          isTeacherOrAdmin={isTeacherOrAdmin}
        />
      )}
    </div>
  );
}
