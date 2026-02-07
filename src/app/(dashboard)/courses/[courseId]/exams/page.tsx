import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  Plus,
  FileText,
  Clock,
  Target,
  RotateCcw,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { ImportButton } from "@/components/export-import-buttons";

interface ExamsPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function ExamsPage({ params }: ExamsPageProps) {
  const { courseId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const userId = session.user.id;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, teacherId: true },
  });

  if (!course) redirect("/courses");

  const isTeacherOrAdmin =
    role === "ADMIN" || (role === "TEACHER" && course.teacherId === userId);

  const exams = await prisma.exam.findMany({
    where: {
      courseId,
      ...(role === "STUDENT" ? { isPublished: true } : {}),
    },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  // For students, check eligibility
  let eligible = false;
  let unpassedCount = 0;
  if (role === "STUDENT") {
    const lessonsWithTests = await prisma.lesson.findMany({
      where: {
        courseId,
        isPublished: true,
        test: { isPublished: true },
      },
      include: {
        test: { select: { id: true } },
      },
    });

    let allPassed = true;
    for (const lesson of lessonsWithTests) {
      if (!lesson.test) continue;
      const passedAttempt = await prisma.testAttempt.findFirst({
        where: {
          testId: lesson.test.id,
          studentId: userId,
          isPassed: true,
        },
      });
      if (!passedAttempt) {
        allPassed = false;
        unpassedCount++;
      }
    }
    eligible = allPassed;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{course.title}</p>
          <h1 className="text-3xl font-bold mt-1">Экзамены</h1>
        </div>
        {isTeacherOrAdmin && (
          <div className="flex items-center gap-2">
            <ImportButton type="exam" targetId={courseId} />
            <Link href={`/courses/${courseId}/exams/new`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Добавить экзамен
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Eligibility notice for students */}
      {role === "STUDENT" && !eligible && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="font-medium text-orange-800 dark:text-orange-200">
                  Экзамены пока недоступны
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-300">
                  Необходимо пройти все тесты уроков. Осталось непройденных тестов: {unpassedCount}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {exams.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">
            {isTeacherOrAdmin
              ? "Экзаменов пока нет. Создайте первый экзамен."
              : "Экзамены для этого курса пока не добавлены."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {exams.map((exam) => (
            <Link
              key={exam.id}
              href={`/courses/${courseId}/exams/${exam.id}`}
            >
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">{exam.title}</CardTitle>
                        {exam.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {exam.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTeacherOrAdmin && (
                        <Badge variant={exam.isPublished ? "default" : "secondary"}>
                          {exam.isPublished ? "Опубликован" : "Черновик"}
                        </Badge>
                      )}
                      {role === "STUDENT" && (
                        eligible ? (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Доступен
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            <Lock className="h-3 w-3 mr-1" />
                            Заблокирован
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {exam._count.questions}{" "}
                      {exam._count.questions === 1
                        ? "вопрос"
                        : exam._count.questions < 5
                        ? "вопроса"
                        : "вопросов"}
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {exam.passingScore}%
                    </div>
                    {exam.timeLimitMin && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {exam.timeLimitMin} мин
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <RotateCcw className="h-4 w-4" />
                      {exam.maxAttempts}{" "}
                      {exam.maxAttempts === 1
                        ? "попытка"
                        : exam.maxAttempts < 5
                        ? "попытки"
                        : "попыток"}
                    </div>
                    {isTeacherOrAdmin && (
                      <span>
                        {exam._count.attempts} попыток студентов
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
