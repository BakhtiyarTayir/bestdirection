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
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [attemptsRemaining, setAttemptsRemaining] = useState(initialAttemptsRemaining);
  const [lastResult, setLastResult] = useState<{
    results: { testCaseId: string; passed: boolean; actualOutput: string | null; error: string | null; executionTime: number }[];
    percentage: number;
    finalScore: number;
    status: string;
  } | null>(null);

  const handleSubmit = async (code: string) => {
    const result = await submitSolution(homework.id, code);

    if (!result.success) {
      toast({
        title: "Ошибка",
        description: result.error || "Не удалось отправить решение",
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

    if (data.status === "PASSED") {
      toast({ title: "Все тесты пройдены!", description: `Результат: ${data.percentage}%` });
    } else if (data.status === "PARTIAL") {
      toast({
        title: "Частично пройдено",
        description: `Пройдено ${data.passed} из ${data.total} тестов`,
      });
    } else {
      toast({
        title: "Тесты не пройдены",
        description: data.status === "ERROR" ? "Ошибка выполнения кода" : "Попробуйте ещё раз",
        variant: "destructive",
      });
    }
  };

  const isOverdue = homework.dueDate && new Date(homework.dueDate) < new Date();

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
                <span className="text-xs">Проходной</span>
              </div>
              <p className="text-lg font-semibold">{homework.passingScore}%</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Таймаут</span>
              </div>
              <p className="text-lg font-semibold">{homework.timeLimitSec} сек</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <RotateCcw className="h-4 w-4" />
                <span className="text-xs">Попытки</span>
              </div>
              <p className="text-lg font-semibold">
                {attemptsRemaining} / {homework.maxAttempts}
              </p>
            </div>
            {homework.dueDate && (
              <div>
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">Дедлайн</span>
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
                ? `Дедлайн истёк. Штраф за опоздание: -${homework.latePenalty}%`
                : "Дедлайн истёк. Отправка решений закрыта."}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="task">
        <TabsList>
          <TabsTrigger value="task">Задание</TabsTrigger>
          <TabsTrigger value="tests">
            Примеры тестов ({homework.testCases.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            История ({submissions.length})
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

        <TabsContent value="tests" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Примеры тестов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {homework.testCases.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Нет открытых тестов для просмотра
                </p>
              ) : (
                homework.testCases.map((tc, i) => (
                  <div key={tc.id} className="border rounded-lg p-3">
                    <div className="font-medium text-sm mb-2">
                      Тест {i + 1}
                      {tc.description ? `: ${tc.description}` : ""}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Вход:</span>
                        <pre className="bg-muted p-2 rounded mt-1 text-xs">{tc.input}</pre>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ожидаемый вывод:</span>
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
              <CardTitle className="text-base">История попыток</CardTitle>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Вы ещё не отправляли решений
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
                    const statusLabels: Record<string, string> = {
                      PASSED: "Пройдено",
                      PARTIAL: "Частично",
                      FAILED: "Не пройдено",
                      ERROR: "Ошибка",
                      RUNNING: "Выполняется",
                      PENDING: "В очереди",
                    };

                    return (
                      <div key={sub.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            Попытка {sub.attemptNumber}
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
                            Тесты: {sub.testResults.filter((r) => r.passed).length}/
                            {sub.testResults.length}
                          </span>
                          <span>Результат: {sub.percentage}%</span>
                          {sub.isLate && (
                            <span className="text-orange-600">
                              Штраф: -{sub.penalty}% (итого: {sub.finalScore}%)
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
