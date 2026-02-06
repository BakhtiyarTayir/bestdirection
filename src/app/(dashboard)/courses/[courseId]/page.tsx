import { requireAuth } from "@/lib/auth-guard";
import { getCourseById } from "@/actions/course-actions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Edit,
  BookOpen,
  Users,
  ClipboardCheck,
  FileText,
} from "lucide-react";

interface CourseDetailPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const { courseId } = await params;
  const session = await requireAuth();
  const role = session.user.role;

  const result = await getCourseById(courseId);
  if (!result.success || !result.data) {
    notFound();
  }

  const course = result.data;
  const isOwnerOrAdmin = role === "ADMIN" || (role === "TEACHER" && course.teacherId === session.user.id);

  // Fetch lessons for this course
  const lessons = await prisma.lesson.findMany({
    where: { courseId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      isPublished: true,
      sortOrder: true,
    },
  });

  // Fetch enrolled count
  const enrolledCount = await prisma.enrollment.count({
    where: { courseId },
  });

  return (
    <div>
      <div className="mb-6">
        <Link href="/courses">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к курсам
          </Button>
        </Link>
      </div>

      {/* Course header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{course.title}</h1>
            {course.isPublished ? (
              <Badge>Опубликован</Badge>
            ) : (
              <Badge variant="secondary">Черновик</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Преподаватель: {course.teacher.firstName} {course.teacher.lastName}
          </p>
          {course.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">
              {course.description}
            </p>
          )}
        </div>

        {isOwnerOrAdmin && (
          <div className="flex gap-2 shrink-0">
            <Link href={`/courses/${courseId}/edit`}>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Редактировать
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Уроки</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lessons.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Студенты</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enrolledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Статус</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {course.isPublished ? "Опубликован" : "Черновик"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation links for admin/teacher */}
      {isOwnerOrAdmin && (
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Link href={`/courses/${courseId}/lessons`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Уроки</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Управление уроками курса
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/courses/${courseId}/students`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Студенты</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Управление записью студентов
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/courses/${courseId}/attendance`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Посещаемость</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Журнал посещаемости
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      )}

      {/* Lesson list */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Уроки</h2>
        {lessons.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">
              В этом курсе пока нет уроков.
            </p>
            {isOwnerOrAdmin && (
              <Link href={`/courses/${courseId}/lessons`}>
                <Button className="mt-4" variant="outline" size="sm">
                  Перейти к управлению уроками
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson, index) => (
              <Link
                key={lesson.id}
                href={`/courses/${courseId}/lessons/${lesson.id}`}
              >
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader className="py-4 px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{lesson.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {lesson.type === "VIDEO" ? "Видео" : "Текст"}
                          </p>
                        </div>
                      </div>
                      {isOwnerOrAdmin && (
                        <>
                          {lesson.isPublished ? (
                            <Badge variant="default">Опубликован</Badge>
                          ) : (
                            <Badge variant="secondary">Черновик</Badge>
                          )}
                        </>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
