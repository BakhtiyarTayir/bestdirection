"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface TestResultItem {
  testCaseId: string;
  passed: boolean;
  actualOutput: string | null;
  error: string | null;
  executionTime: number;
}

interface TestCaseInfo {
  id: string;
  input: string;
  expected: string;
  isHidden: boolean;
  description?: string | null;
}

interface TestResultsPanelProps {
  results: TestResultItem[];
  testCases: TestCaseInfo[];
  percentage: number;
  finalScore: number;
  status: string;
  isLate?: boolean;
  penalty?: number;
}

export function TestResultsPanel({
  results,
  testCases,
  percentage,
  finalScore,
  status,
  isLate,
  penalty,
}: TestResultsPanelProps) {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  const statusColors: Record<string, string> = {
    PASSED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    PARTIAL: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
    FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  };

  const statusLabels: Record<string, string> = {
    PASSED: "Все тесты пройдены",
    PARTIAL: "Частично пройдено",
    FAILED: "Не пройдено",
    ERROR: "Ошибка выполнения",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Результаты проверки</CardTitle>
          <Badge className={statusColors[status] || ""}>
            {statusLabels[status] || status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            Пройдено {passed} из {total} тестов ({percentage}%)
          </span>
          {isLate && penalty ? (
            <span className="text-orange-600">
              Штраф за опоздание: -{penalty}% (итого: {finalScore}%)
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {results.map((result, index) => {
          const testCase = testCases.find((tc) => tc.id === result.testCaseId);
          const isHidden = testCase?.isHidden ?? true;

          return (
            <div
              key={result.testCaseId}
              className={`border rounded-lg p-3 ${
                result.passed
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
                  : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {result.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="font-medium text-sm">
                  Тест {index + 1}
                  {testCase?.description ? `: ${testCase.description}` : ""}
                </span>
                {isHidden && (
                  <Badge variant="outline" className="text-xs">
                    Скрытый
                  </Badge>
                )}
              </div>

              {!isHidden && testCase && (
                <div className="ml-6 space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Вход: </span>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      {testCase.input}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ожидалось: </span>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      {testCase.expected}
                    </code>
                  </div>
                  {result.actualOutput !== null && (
                    <div>
                      <span className="text-muted-foreground">Получено: </span>
                      <code
                        className={`px-1.5 py-0.5 rounded text-xs ${
                          result.passed
                            ? "bg-green-100 dark:bg-green-900/50"
                            : "bg-red-100 dark:bg-red-900/50"
                        }`}
                      >
                        {result.actualOutput}
                      </code>
                    </div>
                  )}
                  {result.error && (
                    <div className="flex items-start gap-1 text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <pre className="text-xs whitespace-pre-wrap">{result.error}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
