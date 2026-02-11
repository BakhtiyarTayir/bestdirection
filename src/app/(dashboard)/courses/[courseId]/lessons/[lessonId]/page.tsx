import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLessonById } from "@/actions/lesson-actions";
import { getLessonProgress } from "@/actions/progress-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, FileText, ClipboardList } from "lucide-react";
import { VideoPlayer } from "@/components/video-player";
import { MarkCompleteButton } from "@/components/mark-complete-button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { LessonTOC } from "@/components/lesson-toc";

interface LessonPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { courseId, lessonId } = await params;
  const result = await getLessonById(lessonId);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Урок не найден</h1>
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
            <Badge variant="secondary">Черновик</Badge>
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
                Редактировать
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
              <p>Конспект не добавлен</p>
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
              Тест: {lesson.assessment.title}
            </h2>
            {isStudent && lesson.assessment.isPublished && (
              <Link
                href={`/courses/${courseId}/lessons/${lessonId}/test`}
              >
                <Button>Пройти тест</Button>
              </Link>
            )}
            {isStudent && !lesson.assessment.isPublished && (
              <p className="text-sm text-muted-foreground">
                Тест пока недоступен
              </p>
            )}
            {isTeacherOrAdmin && (
              <Link
                href={`/courses/${courseId}/lessons/${lessonId}/test`}
              >
                <Button variant="outline">Управление тестом</Button>
              </Link>
            )}
          </div>
        </div>
      ) : isTeacherOrAdmin ? (
        <div className="max-w-4xl">
          <div className="rounded-lg border border-dashed p-6 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground mb-4">
              К этому уроку ещё не добавлен тест
            </p>
            <Link href={`/courses/${courseId}/lessons/${lessonId}/test`}>
              <Button>Создать тест</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
