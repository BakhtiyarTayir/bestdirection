import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
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

interface AttemptsPageProps {
  params: Promise<{
    courseId: string;
    lessonId: string;
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
  params: Promise<{ courseId: string; lessonId: string }>;
  t: ReturnType<typeof useTranslations<"assessments">>;
}) {
  const { courseId, lessonId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "TEACHER") {
    redirect(`/courses/${courseId}/lessons/${lessonId}/test`);
  }

  const assessment = await prisma.assessment.findUnique({
    where: { lessonId },
    include: {
      lesson: {
        select: {
          title: true,
          course: {
            select: { id: true, title: true, teacherId: true },
          },
        },
      },
    },
  });

  if (!assessment) redirect(`/courses/${courseId}/lessons/${lessonId}/test`);

  if (role === "TEACHER" && assessment.lesson?.course.teacherId !== session.user.id) {
    redirect(`/courses/${courseId}`);
  }

  const attempts = await prisma.assessmentAttempt.findMany({
    where: { assessmentId: assessment.id },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
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
  });

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
          {assessment.lesson?.course.title} / {assessment.lesson?.title}
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
                        studentName: `${attempt.student.lastName} ${attempt.student.firstName}`,
                        studentEmail: attempt.student.email,
                        answers: attempt.answers.map((a) => ({
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
