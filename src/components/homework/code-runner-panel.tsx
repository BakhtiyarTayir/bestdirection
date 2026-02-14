"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Play, Loader2 } from "lucide-react";
import { runStudentCode } from "@/actions/homework-review-actions";

interface CodeRunnerPanelProps {
  submissionId: string;
  language: string;
  codeOverride?: string;
}

export function CodeRunnerPanel({ submissionId, language, codeOverride }: CodeRunnerPanelProps) {
  const t = useTranslations("homeworkHub");
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    setOutput(null);
    setError(null);
    setExecTime(null);

    try {
      const result = await runStudentCode(submissionId, stdin || undefined, codeOverride);
      if (result.success && result.data) {
        setOutput(result.data.output || "");
        setError(result.data.error || null);
        setExecTime(result.data.executionTime);
      } else {
        setError(result.success ? "Unknown error" : result.error);
      }
    } catch {
      setError("Failed to execute");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Play className="h-4 w-4" />
          {t("review.runCode")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("review.stdinLabel")}</Label>
          <Textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder={t("review.stdinPlaceholder")}
            rows={2}
            className="font-mono text-sm"
          />
        </div>

        <Button onClick={handleRun} disabled={running} size="sm" className="w-full">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("review.running")}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              {t("review.runCode")}
            </>
          )}
        </Button>

        {(output !== null || error) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("review.output")}</Label>
              {execTime !== null && (
                <span className="text-xs text-muted-foreground">{execTime}ms</span>
              )}
            </div>
            <div className="rounded-md border bg-muted/30 p-3 max-h-48 overflow-auto">
              {output && (
                <pre className="text-sm font-mono whitespace-pre-wrap text-green-700 dark:text-green-400">
                  {output}
                </pre>
              )}
              {error && (
                <pre className="text-sm font-mono whitespace-pre-wrap text-red-600 dark:text-red-400">
                  {error}
                </pre>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
