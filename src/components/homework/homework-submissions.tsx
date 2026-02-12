"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format-date";
import { useTranslations } from "next-intl";

interface Submission {
  id: string;
  code: string;
  status: string;
  score: number;
  maxScore: number;
  percentage: number;
  finalScore: number;
  isLate: boolean;
  penalty: number;
  attemptNumber: number;
  createdAt: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  testResults: {
    passed: boolean;
    testCase: {
      id: string;
      input: string;
      expected: string;
      description: string | null;
    };
  }[];
}

interface HomeworkSubmissionsProps {
  submissions: Submission[];
}

const statusColors: Record<string, string> = {
  PASSED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  PARTIAL: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  PENDING: "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200",
};

export function HomeworkSubmissions({ submissions }: HomeworkSubmissionsProps) {
  const t = useTranslations("homework");

  const statusLabels: Record<string, string> = {
    PASSED: t("statusPassed"),
    PARTIAL: t("statusPartial"),
    FAILED: t("statusFailed"),
    ERROR: t("statusError"),
    RUNNING: t("statusRunning"),
    PENDING: t("statusPending"),
  };

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center py-4">
            {t("noSubmissionsFromStudents")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by student, show best attempt
  const byStudent = new Map<string, Submission[]>();
  for (const sub of submissions) {
    const existing = byStudent.get(sub.student.id) || [];
    existing.push(sub);
    byStudent.set(sub.student.id, existing);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("studentSubmissions", { students: byStudent.size, attempts: submissions.length })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from(byStudent.entries()).map(([studentId, subs]) => {
            const student = subs[0].student;
            const best = subs.reduce((a, b) => (a.percentage > b.percentage ? a : b));
            const latest = subs[0]; // already sorted desc

            return (
              <div key={studentId} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">
                    {student.lastName} {student.firstName}
                  </span>
                  <Badge className={statusColors[best.status] || ""}>
                    {statusLabels[best.status] || best.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{t("attemptsCount", { count: subs.length })}</span>
                  <span>
                    {t("bestResult", { percent: best.percentage })}
                    {best.isLate ? ` ${t("penaltyDetail", { penalty: best.penalty, finalScore: best.finalScore })}` : ""}
                  </span>
                  <span>
                    {t("testsPassedCount", { passed: best.testResults.filter((r) => r.passed).length, total: best.testResults.length })}
                  </span>
                  <span>{t("lastSubmission", { date: formatDateTime(new Date(latest.createdAt)) })}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
