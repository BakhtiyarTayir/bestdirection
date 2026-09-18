import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAssessmentAttempts, getTestByLesson } from "@/lib/api/lessons.server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users } from "lucide-react";
import { AttemptDetailRow } from "@/components/attempt-detail-row";
import { formatDateTime } from "@/lib/format-date";
import { useTranslations } from "next-intl";
import { resolveFullPath } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface AttemptsPageProps {
  params: Promise<{
    courseSlug: string;
    lessonSlug: string;
  }>;
}

export default function AttemptsPage(props: AttemptsPageProps) {
  const t = useTranslations("assessments");
  return <AttemptsPageAsync params={props.params} t={t} />;
}

async function AttemptsPageAsync({
  params,
  t,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
  t: ReturnType<typeof useTranslations<"assessments">>;
}) {
  const { courseSlug, lessonSlug } = await params;
  const { lessonId } = await resolveFullPath({ courseSlug, lessonSlug });

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect(`/courses/${courseSlug}/lessons/${lessonSlug}/test`);
  }

  const assessmentResult = await getTestByLesson(lessonId);
  if (!assessmentResult.success) redirect(`/courses/${courseSlug}/lessons/${lessonSlug}/test`);
  const assessment = assessmentResult.data;

  // Чужой курс отсекает api: разбор попыток открыт только тому, кто вправе
  // править этот тест
  const attemptsResult = await getAssessmentAttempts(assessment.id);
  if (!attemptsResult.success) redirect(`/courses/${courseSlug}`);
  const attempts = attemptsResult.data;

  const totalAttempts = attempts.length;
  const passedAttempts = attempts.filter((a) => a.isPassed).length;
  const uniqueStudents = new Set(attempts.map((a) => a.studentId)).size;
  const avgPercentage =
    totalAttempts > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts
        )
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {assessment.course?.title} / {assessment.lesson?.title}
        </p>
        <h1 className="text-3xl font-bold mt-1">
          {t("resultsPageTitle", { title: assessment.title })}
        </h1>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{totalAttempts}</p>
            <p className="text-xs text-muted-foreground">{t("totalAttempts")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{uniqueStudents}</p>
            <p className="text-xs text-muted-foreground">{t("studentsLabel")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-green-600">
              {passedAttempts}
            </p>
            <p className="text-xs text-muted-foreground">{t("passedCount")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{avgPercentage}%</p>
            <p className="text-xs text-muted-foreground">{t("averageScore")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Attempts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("studentAttempts")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("clickRowToSeeAnswers")}
          </p>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t("noTestAttempts")}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("studentHeader")}</TableHead>
                    <TableHead>{t("emailHeader")}</TableHead>
                    <TableHead className="text-center">{t("scoreHeader")}</TableHead>
                    <TableHead className="text-center">{t("percentHeader")}</TableHead>
                    <TableHead className="text-center">{t("statusHeader")}</TableHead>
                    <TableHead>{t("dateHeader")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempts.map((attempt) => (
                    <AttemptDetailRow
                      key={attempt.id}
                      colSpan={6}
                      attempt={{
                        id: attempt.id,
                        score: attempt.score,
                        maxScore: attempt.maxScore,
                        percentage: attempt.percentage,
                        isPassed: attempt.isPassed,
                        startedAt: formatDateTime(attempt.startedAt),
                        studentName: `${attempt.student?.lastName ?? ""} ${attempt.student?.firstName ?? ""}`.trim(),
                        studentEmail: attempt.student?.email ?? null,
                        answers: (attempt.answers ?? []).map((a) => ({
                          id: a.id,
                          selectedOptionIds: a.selectedOptionIds,
                          isCorrect: a.isCorrect,
                          pointsEarned: a.pointsEarned,
                          question: {
                            id: a.question.id,
                            text: a.question.text,
                            points: a.question.points,
                            options: a.question.options.map((o) => ({
                              id: o.id,
                              text: o.text,
                              isCorrect: o.isCorrect,
                            })),
                          },
                        })),
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
