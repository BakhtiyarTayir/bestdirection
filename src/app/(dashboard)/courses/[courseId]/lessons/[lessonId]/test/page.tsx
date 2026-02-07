import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Target,
  RotateCcw,
  CheckCircle2,
  XCircle,
  BarChart3,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { TestSettingsForm } from "@/components/test-settings-form";
import { QuestionForm } from "@/components/question-form";
import { TestTaking } from "@/components/test-taking";
import { TestResults } from "@/components/test-results";
import { DeleteQuestionButton, DeleteTestButton } from "@/components/test-management-buttons";

interface TestPageProps {
  params: Promise<{
    courseId: string;
    lessonId: string;
  }>;
}

export default async function TestPage({ params }: TestPageProps) {
  const { courseId, lessonId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const userId = session.user.id;

  // Get lesson info
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      course: {
        select: { id: true, title: true, teacherId: true },
      },
    },
  });

  if (!lesson) redirect(`/courses/${courseId}`);

  // Get test with questions
  const test = await prisma.test.findUnique({
    where: { lessonId },
    include: {
      questions: {
        include: {
          options: {
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: { testAttempts: true },
      },
    },
  });

  // Get student attempts if student
  const studentAttempts = role === "STUDENT" && test
    ? await prisma.testAttempt.findMany({
        where: {
          testId: test.id,
          studentId: userId,
        },
        include: {
          answers: {
            include: {
              question: {
                include: {
                  options: { orderBy: { sortOrder: "asc" } },
                },
              },
            },
          },
        },
        orderBy: { startedAt: "desc" },
      })
    : [];

  const isTeacherOrAdmin = role === "ADMIN" || role === "TEACHER";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/courses/${courseId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к курсу
          </Button>
        </Link>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">
          {lesson.course.title} / {lesson.title}
        </p>
        <h1 className="text-3xl font-bold mt-1">
          {test ? test.title : "Тест"}
        </h1>
      </div>

      {/* TEACHER / ADMIN VIEW */}
      {isTeacherOrAdmin && (
        <>
          {!test ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Создать тест
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Для этого урока еще не создан тест. Заполните форму ниже, чтобы создать его.
                </p>
                <TestSettingsForm lessonId={lessonId} courseId={courseId} />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Test Settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Настройки теста
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={test.isPublished ? "default" : "secondary"}>
                        {test.isPublished ? "Опубликован" : "Черновик"}
                      </Badge>
                      <Link href={`/courses/${courseId}/lessons/${lessonId}/test/attempts`}>
                        <Button variant="outline" size="sm">
                          <BarChart3 className="h-4 w-4 mr-2" />
                          Результаты ({test._count.testAttempts})
                        </Button>
                      </Link>
                      <DeleteTestButton testId={test.id} courseId={courseId} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <TestSettingsForm
                    test={{
                      id: test.id,
                      title: test.title,
                      passingScore: test.passingScore,
                      timeLimitMin: test.timeLimitMin,
                      maxAttempts: test.maxAttempts,
                      isPublished: test.isPublished,
                    }}
                    lessonId={lessonId}
                    courseId={courseId}
                  />
                </CardContent>
              </Card>

              {/* Questions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      Вопросы ({test.questions.length})
                    </CardTitle>
                    <QuestionForm testId={test.id} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {test.questions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Вопросов пока нет. Добавьте первый вопрос.
                    </p>
                  ) : (
                    test.questions.map((question, index) => (
                      <div key={question.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-muted-foreground">
                                Вопрос {index + 1}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {question.type === "SINGLE_CHOICE"
                                  ? "Один ответ"
                                  : "Несколько ответов"}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {question.points} {question.points === 1 ? "балл" : question.points < 5 ? "балла" : "баллов"}
                              </Badge>
                            </div>
                            <p className="font-medium">{question.text}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <QuestionForm
                              testId={test.id}
                              question={{
                                id: question.id,
                                text: question.text,
                                type: question.type,
                                points: question.points,
                                sortOrder: question.sortOrder,
                                options: question.options.map((o) => ({
                                  id: o.id,
                                  text: o.text,
                                  isCorrect: o.isCorrect,
                                  sortOrder: o.sortOrder,
                                })),
                              }}
                            />
                            <DeleteQuestionButton questionId={question.id} />
                          </div>
                        </div>
                        <div className="space-y-1.5 ml-4">
                          {question.options.map((option) => (
                            <div
                              key={option.id}
                              className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${
                                option.isCorrect
                                  ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                  : ""
                              }`}
                            >
                              {option.isCorrect ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              )}
                              <span>{option.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Test Info Summary */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Target className="h-4 w-4" />
                        <span className="text-xs">Проходной балл</span>
                      </div>
                      <p className="text-lg font-semibold">{test.passingScore}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">Ограничение</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {test.timeLimitMin ? `${test.timeLimitMin} мин` : "Нет"}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <RotateCcw className="h-4 w-4" />
                        <span className="text-xs">Попытки</span>
                      </div>
                      <p className="text-lg font-semibold">{test.maxAttempts}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <FileText className="h-4 w-4" />
                        <span className="text-xs">Макс. баллов</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {test.questions.reduce((sum, q) => sum + q.points, 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* STUDENT VIEW */}
      {role === "STUDENT" && (
        <>
          {!test || !test.isPublished ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground py-8">
                  Тест для этого урока пока недоступен.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Test Info */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Target className="h-4 w-4" />
                        <span className="text-xs">Проходной балл</span>
                      </div>
                      <p className="text-lg font-semibold">{test.passingScore}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">Ограничение</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {test.timeLimitMin ? `${test.timeLimitMin} мин` : "Нет"}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <RotateCcw className="h-4 w-4" />
                        <span className="text-xs">Попытки</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {studentAttempts.length} / {test.maxAttempts}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <FileText className="h-4 w-4" />
                        <span className="text-xs">Вопросов</span>
                      </div>
                      <p className="text-lg font-semibold">{test.questions.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Start Test or Show Results */}
              {studentAttempts.length < test.maxAttempts && test.questions.length > 0 ? (
                <TestTaking
                  test={{
                    id: test.id,
                    title: test.title,
                    timeLimitMin: test.timeLimitMin,
                    passingScore: test.passingScore,
                    questions: test.questions.map((q) => ({
                      id: q.id,
                      text: q.text,
                      type: q.type,
                      points: q.points,
                      options: q.options.map((o) => ({
                        id: o.id,
                        text: o.text,
                      })),
                    })),
                  }}
                  courseId={courseId}
                  lessonId={lessonId}
                />
              ) : test.questions.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-8">
                      В тесте пока нет вопросов.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-4">
                      Вы использовали все доступные попытки ({test.maxAttempts}).
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Previous Attempts */}
              {studentAttempts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Мои попытки</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {studentAttempts.map((attempt, index) => (
                      <TestResults
                        key={attempt.id}
                        attempt={{
                          id: attempt.id,
                          score: attempt.score,
                          maxScore: attempt.maxScore,
                          percentage: attempt.percentage,
                          isPassed: attempt.isPassed,
                          startedAt: attempt.startedAt.toISOString(),
                          completedAt: attempt.completedAt?.toISOString() || null,
                          answers: attempt.answers.map((a) => ({
                            id: a.id,
                            questionId: a.questionId,
                            selectedOptionIds: a.selectedOptionIds,
                            isCorrect: a.isCorrect,
                            pointsEarned: a.pointsEarned,
                            question: {
                              id: a.question.id,
                              text: a.question.text,
                              type: a.question.type,
                              points: a.question.points,
                              options: a.question.options.map((o) => ({
                                id: o.id,
                                text: o.text,
                                isCorrect: o.isCorrect,
                              })),
                            },
                          })),
                        }}
                        attemptNumber={studentAttempts.length - index}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
