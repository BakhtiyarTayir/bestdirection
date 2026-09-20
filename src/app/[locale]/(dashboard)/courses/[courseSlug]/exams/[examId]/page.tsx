import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getCourseById } from "@/lib/api/courses.server";
import { getAssessment, getMyAssessmentAttempts } from "@/lib/api/lessons.server";
import { Link } from "@/i18n/navigation";
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
} from "lucide-react";
import { AssessmentForm } from "@/components/assessment-form";
import { AssessmentQuestionForm } from "@/components/assessment-question-form";
import { AssessmentTaking } from "@/components/assessment-taking";
import { AssessmentResults } from "@/components/assessment-results";
import { DeleteAssessmentButton, DeleteAssessmentQuestionButton } from "@/components/assessment-management-buttons";
import { ExportButton } from "@/components/export-import-buttons";
import { useTranslations } from "next-intl";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface ExamPageProps {
  params: Promise<{
    courseSlug: string;
    examId: string;
  }>;
}

export default function ExamPage(props: ExamPageProps) {
  const t = useTranslations("assessments");
  const tCommon = useTranslations("common");
  return <ExamPageAsync params={props.params} t={t} tCommon={tCommon} />;
}

async function ExamPageAsync({
  params,
  t,
  tCommon,
}: {
  params: Promise<{ courseSlug: string; examId: string }>;
  t: ReturnType<typeof useTranslations<"assessments">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
}) {
  const { courseSlug, examId } = await params;
  const courseId = await resolveCourseSlug(courseSlug);

  const session = await getSession();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const userId = session.user.id;

  const courseResult = await getCourseById(courseId);
  if (!courseResult.success) redirect("/courses");
  const course = courseResult.data;

  // Черновик экзамена api покажет только персоналу
  const assessmentResult = await getAssessment(examId);
  if (!assessmentResult.success) redirect(`/courses/${courseSlug}/exams`);
  const assessment = assessmentResult.data;
  if (assessment.type !== "EXAM") redirect(`/courses/${courseSlug}/exams`);

  const isTeacherOrAdmin =
    role === "ADMIN" || (role === "TEACHER" && course.teacherId === userId);

  const attemptsResult = role === "STUDENT" ? await getMyAssessmentAttempts(examId) : null;
  const studentAttempts = attemptsResult?.success ? attemptsResult.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {course.title} / {t("exams")}
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
                  {t("examSettings")}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={assessment.isPublished ? "default" : "secondary"}>
                    {assessment.isPublished ? tCommon("published") : tCommon("draft")}
                  </Badge>
                  <Link href={`/courses/${courseSlug}/exams/${examId}/attempts`}>
                    <Button variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      {t("results", { count: assessment._count?.attempts ?? 0 })}
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
                courseSlug={courseSlug}
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
                  {t("questions", { count: assessment.questions.length })}
                </CardTitle>
                <AssessmentQuestionForm assessmentId={assessment.id} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {assessment.questions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {t("noQuestions")}
                </p>
              ) : (
                assessment.questions.map((question, index) => (
                  <div key={question.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-muted-foreground">
                            {t("questionNumber", { number: index + 1 })}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {question.type === "SINGLE_CHOICE"
                              ? t("singleChoice")
                              : t("multipleChoice")}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {question.points} {question.points === 1 ? t("pointOne") : question.points < 5 ? t("pointFew") : t("pointMany")}
                          </Badge>
                        </div>
                        <p className="font-medium whitespace-pre-wrap break-words leading-relaxed">
                          {question.text}
                        </p>
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
                              isCorrect: o.isCorrect ?? false,
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
                    <span className="text-xs">{t("passingScoreLabel")}</span>
                  </div>
                  <p className="text-lg font-semibold">{assessment.passingScore}%</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs">{t("timeLimitLabel")}</span>
                  </div>
                  <p className="text-lg font-semibold">
                    {assessment.timeLimitMin ? `${assessment.timeLimitMin} ${t("minutesShort")}` : t("noTimeLimit")}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <RotateCcw className="h-4 w-4" />
                    <span className="text-xs">{t("attemptsLabel")}</span>
                  </div>
                  <p className="text-lg font-semibold">{assessment.maxAttempts}</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <FileText className="h-4 w-4" />
                    <span className="text-xs">{t("maxPoints")}</span>
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
                  {t("examNotAvailable")}
                </p>
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
                        <span className="text-xs">{t("passingScoreLabel")}</span>
                      </div>
                      <p className="text-lg font-semibold">{assessment.passingScore}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">{t("timeLimitLabel")}</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {assessment.timeLimitMin ? `${assessment.timeLimitMin} ${t("minutesShort")}` : t("noTimeLimit")}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <RotateCcw className="h-4 w-4" />
                        <span className="text-xs">{t("attemptsLabel")}</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {studentAttempts.length} / {assessment.maxAttempts}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <FileText className="h-4 w-4" />
                        <span className="text-xs">{t("questionsLabel")}</span>
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
                />
              ) : assessment.questions.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-8">
                      {t("noQuestionsInExam")}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground py-4">
                      {t("allAttemptsUsed", { count: assessment.maxAttempts })}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Previous Attempts */}
              {studentAttempts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("myAttempts")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {studentAttempts.map((attempt) => (
                      <AssessmentResults
                        key={attempt.id}
                        attempt={{
                          id: attempt.id,
                          score: attempt.score,
                          maxScore: attempt.maxScore,
                          percentage: attempt.percentage,
                          isPassed: attempt.isPassed,
                          startedAt: attempt.startedAt,
                          completedAt: attempt.completedAt,
                        }}
                        attemptNumber={attempt.attemptNumber}
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
