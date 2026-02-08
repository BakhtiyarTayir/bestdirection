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
  FileText,
  GraduationCap,
  Lock,
} from "lucide-react";
import { AssessmentForm } from "@/components/assessment-form";
import { AssessmentQuestionForm } from "@/components/assessment-question-form";
import { AssessmentTaking } from "@/components/assessment-taking";
import { AssessmentResults } from "@/components/assessment-results";
import { DeleteAssessmentButton, DeleteAssessmentQuestionButton } from "@/components/assessment-management-buttons";
import { ExportButton } from "@/components/export-import-buttons";

interface ExamPageProps {
  params: Promise<{
    courseId: string;
    examId: string;
  }>;
}

export default async function ExamPage({ params }: ExamPageProps) {
  const { courseId, examId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const userId = session.user.id;

  // Get course info
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, teacherId: true },
  });

  if (!course) redirect("/courses");

  // Get assessment (exam) with questions
  const assessment = await prisma.assessment.findUnique({
    where: { id: examId },
    include: {
      questions: {
        include: {
          options: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { attempts: true } },
    },
  });

  if (!assessment || assessment.type !== "EXAM") redirect(`/courses/${courseId}/exams`);

  const isTeacherOrAdmin =
    role === "ADMIN" || (role === "TEACHER" && course.teacherId === userId);

  // Student-specific data
  let eligible = false;
  let unpassedTests: { lessonTitle: string; testTitle: string }[] = [];

  if (role === "STUDENT") {
    // Check eligibility: all published lesson tests must be passed
    const lessonTests = await prisma.assessment.findMany({
      where: {
        courseId,
        type: "TEST",
        isPublished: true,
        lessonId: { not: null },
      },
      include: {
        lesson: { select: { title: true } },
      },
    });

    let allPassed = true;
    for (const test of lessonTests) {
      const passedAttempt = await prisma.assessmentAttempt.findFirst({
        where: {
          assessmentId: test.id,
          studentId: userId,
          isPassed: true,
        },
      });
      if (!passedAttempt) {
        allPassed = false;
        unpassedTests.push({
          lessonTitle: test.lesson?.title ?? "",
          testTitle: test.title,
        });
      }
    }
    eligible = allPassed;
  }

  // Get student attempts
  const studentAttempts = role === "STUDENT"
    ? await prisma.assessmentAttempt.findMany({
        where: { assessmentId: examId, studentId: userId },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {course.title} / Экзамены
          </p>
          <h1 className="text-3xl font-bold mt-1">{assessment.title}</h1>
        </div>
        {isTeacherOrAdmin && (
          <div className="flex items-center gap-2">
            <ExportButton type="exam" id={examId} />
            <DeleteAssessmentButton assessmentId={assessment.id} type="EXAM" />
          </div>
        )}
      </div>

      {/* TEACHER / ADMIN VIEW */}
      {isTeacherOrAdmin && (
        <>
          {/* Exam Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Настройки экзамена
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={assessment.isPublished ? "default" : "secondary"}>
                    {assessment.isPublished ? "Опубликован" : "Черновик"}
                  </Badge>
                  <Link href={`/courses/${courseId}/exams/${examId}/attempts`}>
                    <Button variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Результаты ({assessment._count.attempts})
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {assessment.description && (
                <p className="text-muted-foreground mb-4">{assessment.description}</p>
              )}
              <AssessmentForm
                type="EXAM"
                courseId={courseId}
                assessment={{
                  id: assessment.id,
                  title: assessment.title,
                  description: assessment.description,
                  passingScore: assessment.passingScore,
                  timeLimitMin: assessment.timeLimitMin,
                  maxAttempts: assessment.maxAttempts,
                  isPublished: assessment.isPublished,
                }}
              />
            </CardContent>
          </Card>

          {/* Questions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  Вопросы ({assessment.questions.length})
                </CardTitle>
                <AssessmentQuestionForm assessmentId={assessment.id} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {assessment.questions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Вопросов пока нет. Добавьте первый вопрос.
                </p>
              ) : (
                assessment.questions.map((question, index) => (
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
                        <AssessmentQuestionForm
                          assessmentId={assessment.id}
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
                        <DeleteAssessmentQuestionButton questionId={question.id} />
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

          {/* Exam Info Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Target className="h-4 w-4" />
                    <span className="text-xs">Проходной балл</span>
                  </div>
                  <p className="text-lg font-semibold">{assessment.passingScore}%</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs">Ограничение</span>
                  </div>
                  <p className="text-lg font-semibold">
                    {assessment.timeLimitMin ? `${assessment.timeLimitMin} мин` : "Нет"}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <RotateCcw className="h-4 w-4" />
                    <span className="text-xs">Попытки</span>
                  </div>
                  <p className="text-lg font-semibold">{assessment.maxAttempts}</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <FileText className="h-4 w-4" />
                    <span className="text-xs">Макс. баллов</span>
                  </div>
                  <p className="text-lg font-semibold">
                    {assessment.questions.reduce((sum, q) => sum + q.points, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* STUDENT VIEW */}
      {role === "STUDENT" && (
        <>
          {!assessment.isPublished ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground py-8">
                  Этот экзамен пока недоступен.
                </p>
              </CardContent>
            </Card>
          ) : !eligible ? (
            <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-800 dark:text-orange-200">
                      Экзамен заблокирован
                    </p>
                    <p className="text-sm text-orange-600 dark:text-orange-300 mb-3">
                      Пройдите все тесты уроков, чтобы получить доступ к экзамену.
                    </p>
                    <div className="space-y-1">
                      {unpassedTests.map((t, i) => (
                        <p key={i} className="text-sm text-orange-600 dark:text-orange-300">
                          • {t.lessonTitle} — {t.testTitle}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Exam Info */}
              <Card>
                <CardContent className="pt-6">
                  {assessment.description && (
                    <p className="text-muted-foreground mb-4">{assessment.description}</p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Target className="h-4 w-4" />
                        <span className="text-xs">Проходной балл</span>
                      </div>
                      <p className="text-lg font-semibold">{assessment.passingScore}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">Ограничение</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {assessment.timeLimitMin ? `${assessment.timeLimitMin} мин` : "Нет"}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <RotateCcw className="h-4 w-4" />
                        <span className="text-xs">Попытки</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {studentAttempts.length} / {assessment.maxAttempts}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <FileText className="h-4 w-4" />
                        <span className="text-xs">Вопросов</span>
                      </div>
                      <p className="text-lg font-semibold">{assessment.questions.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Start Exam or Show Results */}
              {studentAttempts.length < assessment.maxAttempts && assessment.questions.length > 0 ? (
                <AssessmentTaking
                  assessment={{
                    id: assessment.id,
                    type: "EXAM",
                    title: assessment.title,
                    timeLimitMin: assessment.timeLimitMin,
                    passingScore: assessment.passingScore,
                    questions: assessment.questions.map((q) => ({
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
                />
              ) : assessment.questions.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-8">
                      В экзамене пока нет вопросов.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-4">
                      Вы использовали все доступные попытки ({assessment.maxAttempts}).
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
                      <AssessmentResults
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
