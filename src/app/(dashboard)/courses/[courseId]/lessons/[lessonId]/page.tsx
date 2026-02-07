import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLessonById } from "@/actions/lesson-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Video, FileText } from "lucide-react";

import { VideoPlayer } from "@/components/video-player";

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          <div className="flex items-center gap-2">
            {lesson.type === "VIDEO" ? (
              <Badge variant="outline" className="flex items-center gap-1">
                <Video className="h-3 w-3" />
                Видео
              </Badge>
            ) : (
              <Badge variant="outline" className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Текст
              </Badge>
            )}
            {!lesson.isPublished && (
              <Badge variant="secondary">Черновик</Badge>
            )}
          </div>
        </div>

        {isTeacherOrAdmin && (
          <Link href={`/courses/${courseId}/lessons/${lessonId}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Редактировать
            </Button>
          </Link>
        )}
      </div>

      {/* Content */}
      <div className="max-w-4xl">
        {lesson.type === "VIDEO" && lesson.videoUrl && lesson.videoSource && (
          <div className="rounded-lg overflow-hidden border bg-black">
            <VideoPlayer url={lesson.videoUrl} source={lesson.videoSource} />
          </div>
        )}

        {lesson.type === "VIDEO" && !lesson.videoUrl && (
          <div className="rounded-lg border p-12 text-center text-muted-foreground">
            <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Видео не добавлено</p>
          </div>
        )}

        {lesson.type === "TEXT" && lesson.content && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <div className="whitespace-pre-wrap rounded-lg border p-6 bg-card">
              {lesson.content}
            </div>
          </div>
        )}

        {lesson.type === "TEXT" && !lesson.content && (
          <div className="rounded-lg border p-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Содержимое не добавлено</p>
          </div>
        )}
      </div>

      {/* Test section */}
      {lesson.test && (
        <div className="max-w-4xl">
          <div className="rounded-lg border p-6 bg-card">
            <h2 className="text-lg font-semibold mb-2">
              Тест: {lesson.test.title}
            </h2>
            {isStudent && lesson.test.isPublished && (
              <Link
                href={`/courses/${courseId}/lessons/${lessonId}/test`}
              >
                <Button>Пройти тест</Button>
              </Link>
            )}
            {isStudent && !lesson.test.isPublished && (
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
      )}
    </div>
  );
}
