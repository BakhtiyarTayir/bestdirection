"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format-date";
import { Clock, Trophy } from "lucide-react";

/**
 * Итог попытки для ученика: баллы, процент и результат. Разбор ответов
 * здесь не показывается — решение владельца от 2026-09-18: правильные
 * варианты видит только преподаватель, иначе оставшиеся попытки ученик
 * сдаёт по подсмотренным ключам.
 */
interface AssessmentResultsProps {
  attempt: {
    id: string;
    score: number;
    maxScore: number;
    percentage: number;
    isPassed: boolean;
    startedAt: string;
    completedAt: string | null;
  };
  attemptNumber?: number;
}

export function AssessmentResults({ attempt, attemptNumber }: AssessmentResultsProps) {
  const t = useTranslations("assessments");

  const startedAt = new Date(attempt.startedAt);
  const completedAt = attempt.completedAt
    ? new Date(attempt.completedAt)
    : null;

  const timeTaken = completedAt
    ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
    : null;

  const formatTimeTaken = (seconds: number): string => {
    if (seconds < 60) return `${seconds} ${t("seconds")}`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins} ${t("minutesShort")}`;
    return `${mins} ${t("minutesAndSeconds", { seconds: secs })}`;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Summary Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          {attemptNumber && (
            <span className="text-sm text-muted-foreground font-medium">
              {t("attemptNumber", { number: attemptNumber })}
            </span>
          )}
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">
              {attempt.score} / {attempt.maxScore}
            </span>
            <span className="text-muted-foreground">({attempt.percentage}%)</span>
          </div>
          <Badge variant={attempt.isPassed ? "default" : "destructive"}>
            {attempt.isPassed ? t("passed") : t("failed")}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          {timeTaken !== null && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTimeTaken(timeTaken)}
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(startedAt)}
          </span>
        </div>
      </div>

    </div>
  );
}
