import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getStudentAssessmentResults } from "@/lib/api/lessons.server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Trophy, CheckCircle2, GraduationCap } from "lucide-react";
import { formatDateTime } from "@/lib/format-date";
import { useTranslations } from "next-intl";

export const dynamic = "force-dynamic";

export default function MyResultsPage() {
  const t = useTranslations("results");
  const tAssessments = useTranslations("assessments");
  const tCommon = useTranslations("common");
  return <MyResultsPageAsync t={t} tAssessments={tAssessments} tCommon={tCommon} />;
}

async function MyResultsPageAsync({
  t,
  tAssessments,
  tCommon,
}: {
  t: ReturnType<typeof useTranslations<"results">>;
  tAssessments: ReturnType<typeof useTranslations<"assessments">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "STUDENT") {
    redirect("/dashboard");
  }

  // Только завершённые попытки: начатую показывать нечем
  const resultsResult = await getStudentAssessmentResults();
  const allAttempts = resultsResult.success ? resultsResult.data : [];

  const testAttempts = allAttempts.filter((a) => a.assessment?.type === "TEST");
  const examAttempts = allAttempts.filter((a) => a.assessment?.type === "EXAM");

  // Stats (combined)
  const totalAttempts = allAttempts.length;
  const passedAttempts = allAttempts.filter((a) => a.isPassed).length;
  const avgPercentage =
    totalAttempts > 0
      ? Math.round(
          allAttempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts
        )
      : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("title")}</h1>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalAttempts}</p>
                <p className="text-xs text-muted-foreground">{t("totalAttempts")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {passedAttempts}
                </p>
                <p className="text-xs text-muted-foreground">{t("successful")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{avgPercentage}%</p>
                <p className="text-xs text-muted-foreground">{t("averageScore")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>{tAssessments("historyTests")}</CardTitle>
        </CardHeader>
        <CardContent>
          {testAttempts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {tAssessments("noTestHistory")}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("course")}</TableHead>
                    <TableHead>{t("lesson")}</TableHead>
                    <TableHead>{t("test")}</TableHead>
                    <TableHead className="text-center">{tCommon("points")}</TableHead>
                    <TableHead className="text-center">{tCommon("percent")}</TableHead>
                    <TableHead className="text-center">{tCommon("status")}</TableHead>
                    <TableHead>{tCommon("date")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">
                        {attempt.assessment?.course.title}
                      </TableCell>
                      <TableCell>
                        {attempt.assessment?.lesson?.title ?? "\u2014"}
                      </TableCell>
                      <TableCell>{attempt.assessment?.title}</TableCell>
                      <TableCell className="text-center">
                        {attempt.score} / {attempt.maxScore}
                      </TableCell>
                      <TableCell className="text-center">
                        {attempt.percentage}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            attempt.isPassed ? "default" : "destructive"
                          }
                        >
                          {attempt.isPassed ? tAssessments("passed") : tAssessments("failed")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(attempt.startedAt)}
                      </TableCell>
                      <TableCell>
                        {attempt.assessment?.lessonId && (
                          <Link
                            href={`/courses/${attempt.assessment?.course.slug}/lessons/${attempt.assessment?.lesson?.slug}/test`}
                          >
                            <Button variant="ghost" size="sm">
                              {tCommon("details")}
                            </Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exam Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {tAssessments("historyExams")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {examAttempts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {tAssessments("noExamHistory")}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("course")}</TableHead>
                    <TableHead>{t("examLabel")}</TableHead>
                    <TableHead className="text-center">{tCommon("points")}</TableHead>
                    <TableHead className="text-center">{tCommon("percent")}</TableHead>
                    <TableHead className="text-center">{tCommon("status")}</TableHead>
                    <TableHead>{tCommon("date")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">
                        {attempt.assessment?.course.title}
                      </TableCell>
                      <TableCell>{attempt.assessment?.title}</TableCell>
                      <TableCell className="text-center">
                        {attempt.score} / {attempt.maxScore}
                      </TableCell>
                      <TableCell className="text-center">
                        {attempt.percentage}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            attempt.isPassed ? "default" : "destructive"
                          }
                        >
                          {attempt.isPassed ? tAssessments("passed") : tAssessments("failed")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(attempt.startedAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/courses/${attempt.assessment?.course.slug}/exams/${attempt.assessment?.id}`}
                        >
                          <Button variant="ghost" size="sm">
                            {tCommon("details")}
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
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
