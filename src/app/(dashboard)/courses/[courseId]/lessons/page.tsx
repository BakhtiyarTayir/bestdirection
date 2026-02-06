import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLessons } from "@/actions/lesson-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Video, FileText, Plus, Edit, Trash2, ArrowLeft, Eye, GripVertical } from "lucide-react";
import { DeleteLessonButton } from "./delete-lesson-button";

interface LessonsPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function LessonsPage({ params }: LessonsPageProps) {
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
        <div className="flex items-center gap-4">
          <Link href={`/courses/${courseId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Уроки</h1>
        </div>
        {isTeacherOrAdmin && (
          <Link href={`/courses/${courseId}/lessons/new`}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Добавить урок
            </Button>
          </Link>
        )}
      </div>

      {!result.success && (
        <p className="text-destructive">{result.error}</p>
      )}

      {lessons.length === 0 && result.success && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Уроки пока не добавлены</p>
        </div>
      )}

      <div className="space-y-3">
        {lessons.map((lesson) => (
          <Card key={lesson.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                <span className="text-sm font-mono w-8 text-center">
                  {lesson.sortOrder}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {lesson.type === "VIDEO" ? (
                  <Video className="h-5 w-5 text-blue-500" />
                ) : (
                  <FileText className="h-5 w-5 text-green-500" />
                )}
              </div>

              <Link
                href={`/courses/${courseId}/lessons/${lesson.id}`}
                className="flex-1 hover:underline font-medium"
              >
                {lesson.title}
              </Link>

              <div className="flex items-center gap-2">
                {lesson.isPublished ? (
                  <Badge variant="default">Опубликован</Badge>
                ) : (
                  <Badge variant="secondary">Черновик</Badge>
                )}

                {lesson.test && (
                  <Badge variant="outline">Тест</Badge>
                )}
              </div>

              {isTeacherOrAdmin && (
                <div className="flex items-center gap-1">
                  <Link href={`/courses/${courseId}/lessons/${lesson.id}`}>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href={`/courses/${courseId}/lessons/${lesson.id}/edit`}>
                    <Button variant="ghost" size="icon">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                  <DeleteLessonButton
                    lessonId={lesson.id}
                    courseId={courseId}
                    lessonTitle={lesson.title}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
