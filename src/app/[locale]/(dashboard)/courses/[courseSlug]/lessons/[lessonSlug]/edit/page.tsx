import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLessonHomeworks } from "@/lib/api/homework.server";
import { getLessonById, getTestByLesson } from "@/lib/api/lessons.server";
import { EditLessonClient } from "./edit-lesson-client";
import { getTranslations } from "next-intl/server";
import { resolveFullPath } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface EditLessonPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}

export default async function EditLessonPage({ params }: EditLessonPageProps) {
  const tErrors = await getTranslations("errors");
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseSlug, lessonSlug } = await params;
  const { courseId, lessonId } = await resolveFullPath({ courseSlug, lessonSlug });
  const result = await getLessonById(lessonId);

  if (!result.success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{tErrors("lessonNotFound")}</h1>
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  const lesson = result.data;

  const [assessmentResult, homeworksResult] = await Promise.all([
    getTestByLesson(lessonId),
    getLessonHomeworks(lessonId),
  ]);
  const homeworks = homeworksResult.success ? homeworksResult.data : [];

  // Теста может не быть — вкладка тогда предложит его создать
  const assessment = assessmentResult.success ? assessmentResult.data : null;

  return (
    <div className="space-y-6">
      <EditLessonClient
        courseId={courseId}
        courseSlug={courseSlug}
        lessonSlug={lessonSlug}
        lesson={lesson}
        assessment={assessment}
        homeworks={homeworks}
      />
    </div>
  );
}
