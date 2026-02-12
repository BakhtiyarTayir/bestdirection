import { auth } from "@/lib/auth";
import { redirect, Link } from "@/i18n/navigation";
import { getLessonById } from "@/actions/lesson-actions";
import { getLessonProgress } from "@/actions/progress-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, FileText, ClipboardList, Code2 } from "lucide-react";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { VideoPlayer } from "@/components/video-player";
import { MarkCompleteButton } from "@/components/mark-complete-button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { LessonTOC } from "@/components/lesson-toc";
import { useTranslations } from "next-intl";

interface LessonPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
  const t = useTranslations("lessons");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tAssessments = useTranslations("assessments");
  const tHomework = useTranslations("homework");
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { courseId, lessonId } = await params;
  const result = await getLessonById(lessonId);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{tErrors("lessonNotFound")}</h1>
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  const lesson = result.data;
  const isTeacherOrAdmin =
    session.user.role === "ADMIN" || session.user.role === "TEACHER";
  const isStudent = session.user.role === "STUDENT";

  // Fetch progress for students
  let initialPosition = 0;
  let isCompleted = false;
  if (isStudent) {
    const progressResult = await getLessonProgress(lessonId);
    if (progressResult.success && progressResult.data) {
      initialPosition = progressResult.data.lastPosition;
      isCompleted = !!progressResult.data.completedAt;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          {!lesson.isPublished && (
            <Badge variant="secondary">{tCommon("draft")}</Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isStudent && (
            <MarkCompleteButton lessonId={lessonId} isCompleted={isCompleted} />
          )}
          {isTeacherOrAdmin && (
            <Link href={`/courses/${courseId}/lessons/${lessonId}/edit`}>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                {tCommon("edit")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-8">
        <div className="flex-1 min-w-0 max-w-4xl space-y-6">
          {/* Video (if available) */}
          {lesson.videoUrl && lesson.videoSource && (
            <div className="rounded-lg overflow-hidden border bg-black">
              <VideoPlayer
                url={lesson.videoUrl}
                source={lesson.videoSource}
                lessonId={isStudent ? lessonId : undefined}
                initialPosition={isStudent ? initialPosition : undefined}
              />
            </div>
          )}

          {/* Text content (always shown) */}
          {lesson.content ? (
            <div className="rounded-lg border p-6 bg-card">
              <MarkdownRenderer content={lesson.content} />
            </div>
          ) : (
            <div className="rounded-lg border p-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("noContent")}</p>
            </div>
          )}
        </div>

        {/* Table of Contents */}
        {lesson.content && (
          <aside className="hidden lg:block shrink-0">
            <LessonTOC content={lesson.content} />
          </aside>
        )}
      </div>

      {/* Assessment section */}
      {lesson.assessment ? (
        <div className="max-w-4xl">
          <div className="rounded-lg border p-6 bg-card">
            <h2 className="text-lg font-semibold mb-2">
              {tAssessments("test")}: {lesson.assessment.title}
            </h2>
            {isStudent && lesson.assessment.isPublished && (
              <Link
                href={`/courses/${courseId}/lessons/${lessonId}/test`}
              >
                <Button>{t("takeTest")}</Button>
              </Link>
            )}
            {isStudent && !lesson.assessment.isPublished && (
              <p className="text-sm text-muted-foreground">
                {t("testNotAvailable")}
              </p>
            )}
            {isTeacherOrAdmin && (
              <Link
                href={`/courses/${courseId}/lessons/${lessonId}/test`}
              >
                <Button variant="outline">{t("manageTest")}</Button>
              </Link>
            )}
          </div>
        </div>
      ) : isTeacherOrAdmin ? (
        <div className="max-w-4xl">
          <div className="rounded-lg border border-dashed p-6 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground mb-4">
              {t("noTestAdded")}
            </p>
            <Link href={`/courses/${courseId}/lessons/${lessonId}/test`}>
              <Button>{tAssessments("createTest")}</Button>
            </Link>
          </div>
        </div>
      ) : null}

      {/* Homework section */}
      {lesson.homeworks && lesson.homeworks.length > 0 && (
        <div className="max-w-4xl space-y-3">
          {lesson.homeworks.map((hw: { id: string; title: string; language: string | null; isPublished: boolean; passingScore: number }) => (
            <div key={hw.id} className="rounded-lg border p-6 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Code2 className="h-5 w-5" />
                <h2 className="text-lg font-semibold">{hw.title}</h2>
                {hw.language && (
                  <Badge variant="outline" className="text-xs">
                    {LANGUAGE_LABELS[hw.language] || hw.language}
                  </Badge>
                )}
                {!hw.isPublished && <Badge variant="secondary">{tCommon("draft")}</Badge>}
              </div>
              {isStudent && hw.isPublished && (
                <Link href={`/courses/${courseId}/lessons/${lessonId}/homework/${hw.id}`}>
                  <Button>{t("doHomework")}</Button>
                </Link>
              )}
              {isStudent && !hw.isPublished && (
                <p className="text-sm text-muted-foreground">{t("homeworkNotAvailable")}</p>
              )}
              {isTeacherOrAdmin && (
                <Link href={`/courses/${courseId}/lessons/${lessonId}/homework/${hw.id}`}>
                  <Button variant="outline">{t("manageHomework")}</Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
