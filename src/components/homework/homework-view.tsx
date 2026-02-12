"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { CodeEditor } from "./code-editor";
import { TestResultsPanel } from "./test-results-panel";
import { submitSolution } from "@/actions/homework-actions";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { formatDateTime } from "@/lib/format-date";
import { useTranslations } from "next-intl";
import {
  Clock,
  Target,
  RotateCcw,
  Code2,
  Calendar,
  AlertTriangle,
} from "lucide-react";

interface TestCase {
  id: string;
  input: string;
  expected: string;
  points: number;
  description: string | null;
  sortOrder: number;
}

interface TestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: string | null;
  errorOutput: string | null;
  executionTime: number | null;
  testCase: {
    id: string;
    input: string;
    expected: string;
    isHidden: boolean;
    description: string | null;
  };
}

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
  testResults: TestResult[];
}

interface HomeworkData {
  id: string;
  title: string;
  description: string;
  language: string | null;
  starterCode: string | null;
  maxAttempts: number;
  timeLimitSec: number;
  passingScore: number;
  maxScore: number;
  dueDate: string | null;
  allowLate: boolean;
  latePenalty: number;
  lessonId: string;
  lesson: {
    id: string;
    title: string;
    courseId: string;
    course: { id: string; title: string };
  };
  testCases: TestCase[];
}

interface HomeworkViewProps {
  homework: HomeworkData;
  submissions: Submission[];
  attemptsUsed: number;
  attemptsRemaining: number;
}

export function HomeworkView({
  homework,
  submissions: initialSubmissions,
  attemptsUsed: initialAttemptsUsed,
  attemptsRemaining: initialAttemptsRemaining,
}: HomeworkViewProps) {
  const { toast } = useToast();
  const t = useTranslations("homework");
  const tErrors = useTranslations("errors");
  const tAssessments = useTranslations("assessments");
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [attemptsRemaining, setAttemptsRemaining] = useState(initialAttemptsRemaining);
  const [activeTab, setActiveTab] = useState("task");
  const [lastResult, setLastResult] = useState<{
    results: { testCaseId: string; passed: boolean; actualOutput: string | null; error: string | null; executionTime: number }[];
    percentage: number;
    finalScore: number;
    status: string;
  } | null>(null);

  // Collect unique error output from test results
  const errorOutput = lastResult
    ? [...new Set(
        lastResult.results
          .map((r) => r.error)
          .filter((e): e is string => e !== null)
      )].join("\n\n") || null
    : null;

  const hasErrors = lastResult?.status === "ERROR" || lastResult?.status === "FAILED";

  const handleSubmit = async (code: string) => {
    const result = await submitSolution(homework.id, code);

    if (!result.success) {
      toast({
        title: tErrors("generic"),
        description: result.error || t("submitFailed"),
        variant: "destructive",
      });
      return;
    }

    const data = result.data!;
    setLastResult({
      results: data.testResults,
      percentage: data.percentage,
      finalScore: data.finalScore,
      status: data.status,
    });
    setAttemptsRemaining((prev) => prev - 1);

    // Auto-switch to output tab when there are errors
    const hasErr = data.testResults.some((r: { error: string | null }) => r.error !== null);
    if (hasErr && data.status !== "PASSED") {
      setActiveTab("output");
    }

    if (data.status === "PASSED") {
      toast({ title: t("allTestsPassed"), description: t("resultPercent", { percent: data.percentage }) });
    } else if (data.status === "PARTIAL") {
      toast({
        title: t("partiallyPassed"),
        description: t("passedOfTotal", { passed: data.passed, total: data.total }),
      });
    } else {
      toast({
        title: t("testsFailed"),
        description: data.status === "ERROR" ? t("executionError") : t("tryAgain"),
        variant: "destructive",
      });
    }
  };

  const isOverdue = homework.dueDate && new Date(homework.dueDate) < new Date();

  const statusLabels: Record<string, string> = {
    PASSED: t("statusPassed"),
    PARTIAL: t("statusPartial"),
    FAILED: t("statusFailed"),
    ERROR: t("statusError"),
    RUNNING: t("statusRunning"),
    PENDING: t("statusPending"),
  };

  return (
    <div className="space-y-6">
      {/* Homework Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{homework.title}</CardTitle>
            {homework.language && (
              <Badge variant="outline">
                <Code2 className="h-3 w-3 mr-1" />
                {LANGUAGE_LABELS[homework.language] || homework.language}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
            <p className="whitespace-pre-wrap">{homework.description}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center border-t pt-4">
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Target className="h-4 w-4" />
                <span className="text-xs">{t("passingLabel")}</span>
              </div>
              <p className="text-lg font-semibold">{homework.passingScore}%</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">{t("timeoutLabel")}</span>
              </div>
              <p className="text-lg font-semibold">{homework.timeLimitSec} {tAssessments("seconds")}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <RotateCcw className="h-4 w-4" />
                <span className="text-xs">{t("attemptsLabel")}</span>
              </div>
              <p className="text-lg font-semibold">
                {attemptsRemaining} / {homework.maxAttempts}
              </p>
            </div>
            {homework.dueDate && (
              <div>
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">{t("deadlineLabel")}</span>
                </div>
                <p className={`text-sm font-semibold ${isOverdue ? "text-red-600" : ""}`}>
                  {formatDateTime(new Date(homework.dueDate))}
                </p>
              </div>
            )}
          </div>
          {isOverdue && (
            <div className="flex items-center gap-2 mt-3 p-2 rounded bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200 text-sm">
              <AlertTriangle className="h-4 w-4" />
              {homework.allowLate
                ? t("deadlineExpiredPenalty", { penalty: homework.latePenalty })
                : t("deadlineExpiredClosed")}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="task">{t("editorTab")}</TabsTrigger>
          <TabsTrigger value="output" className={errorOutput ? "text-red-600" : ""}>
            {t("outputTab")}
          </TabsTrigger>
          <TabsTrigger value="tests">
            {t("testsTab", { count: homework.testCases.length })}
          </TabsTrigger>
          <TabsTrigger value="history">
            {t("historyTab", { count: submissions.length })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="task" className="mt-4 space-y-4">
          {homework.language && (
            <CodeEditor
              language={homework.language}
              starterCode={homework.starterCode}
              attemptsRemaining={attemptsRemaining}
              onSubmit={handleSubmit}
              disabled={!!(isOverdue && !homework.allowLate)}
            />
          )}

          {lastResult && (
            <TestResultsPanel
              results={lastResult.results}
              testCases={homework.testCases.map((tc) => ({
                ...tc,
                isHidden: false,
                description: tc.description,
              }))}
              percentage={lastResult.percentage}
              finalScore={lastResult.finalScore}
              status={lastResult.status}
              isLate={!!isOverdue}
              penalty={homework.latePenalty}
            />
          )}
        </TabsContent>

        <TabsContent value="output" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {!lastResult ? (
                <p className="text-muted-foreground text-center py-8">
                  {t("submitToSeeOutput")}
                </p>
              ) : errorOutput ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900 dark:bg-yellow-950/50 dark:border-yellow-900 dark:text-yellow-200">
                    <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">
                      {t("codeHasErrors")}
                    </p>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap leading-relaxed">
                    {errorOutput}
                  </pre>
                </div>
              ) : lastResult.status === "PASSED" ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/50 dark:border-green-900 dark:text-green-200">
                  <p className="text-sm">{t("allTestsPassedSuccess")}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-900 dark:text-red-200">
                    <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">
                      {t("someTestsFailed")}
                    </p>
                  </div>
                  {lastResult.results
                    .filter((r) => !r.passed && r.actualOutput)
                    .map((r, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-muted-foreground">{t("testOutput", { number: i + 1 })}</span>
                        <pre className="bg-muted p-2 rounded mt-1 text-xs">{r.actualOutput}</pre>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tests" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("exampleTests")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {homework.testCases.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  {t("noVisibleTests")}
                </p>
              ) : (
                homework.testCases.map((tc, i) => (
                  <div key={tc.id} className="border rounded-lg p-3">
                    <div className="font-medium text-sm mb-2">
                      {t("testCaseLabel", { number: i + 1, description: tc.description || "" })}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t("input")}</span>
                        <pre className="bg-muted p-2 rounded mt-1 text-xs">{tc.input}</pre>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("expectedOutput")}</span>
                        <pre className="bg-muted p-2 rounded mt-1 text-xs">{tc.expected}</pre>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("attemptHistory")}</CardTitle>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  {t("noSubmissions")}
                </p>
              ) : (
                <div className="space-y-3">
                  {submissions.map((sub) => {
                    const statusColors: Record<string, string> = {
                      PASSED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
                      PARTIAL: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
                      FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
                      ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
                    };

                    return (
                      <div key={sub.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            {t("attemptLabel", { number: sub.attemptNumber })}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge className={statusColors[sub.status] || ""}>
                              {statusLabels[sub.status] || sub.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {formatDateTime(new Date(sub.createdAt))}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>
                            {t("testsPassedCount", { passed: sub.testResults.filter((r) => r.passed).length, total: sub.testResults.length })}
                          </span>
                          <span>{t("resultScore", { percent: sub.percentage })}</span>
                          {sub.isLate && (
                            <span className="text-orange-600">
                              {t("penaltyInfo", { penalty: sub.penalty, finalScore: sub.finalScore })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
