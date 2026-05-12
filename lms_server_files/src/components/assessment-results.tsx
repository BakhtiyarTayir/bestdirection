"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/format-date";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Trophy,
} from "lucide-react";

interface AttemptAnswer {
  id: string;
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  pointsEarned: number;
  question: {
    id: string;
    text: string;
    type: string;
    points: number;
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
    }[];
  };
}

interface AssessmentResultsProps {
  attempt: {
    id: string;
    score: number;
    maxScore: number;
    percentage: number;
    isPassed: boolean;
    startedAt: string;
    completedAt: string | null;
    answers: AttemptAnswer[];
  };
  attemptNumber?: number;
}

export function AssessmentResults({ attempt, attemptNumber }: AssessmentResultsProps) {
  const [expanded, setExpanded] = useState(false);
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
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
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
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Detailed Answers */}
      {expanded && (
        <div className="border-t">
          <div className="p-4 space-y-4">
            {attempt.answers.map((answer, index) => (
              <div key={answer.id} className="space-y-2">
                {index > 0 && <Separator />}
                <div className="flex items-start gap-2 pt-2">
                  {answer.isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm whitespace-pre-wrap break-words leading-relaxed">
                        <span className="text-muted-foreground mr-1">
                          {index + 1}.
                        </span>
                        {answer.question.text}
                      </p>
                      <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                        {answer.pointsEarned} / {answer.question.points}{" "}
                        {answer.question.points === 1
                          ? t("pointOne")
                          : answer.question.points < 5
                          ? t("pointFew")
                          : t("pointMany")}
                      </span>
                    </div>

                    <div className="space-y-1 ml-2">
                      {answer.question.options.map((option) => {
                        const isSelected =
                          answer.selectedOptionIds.includes(option.id);
                        const isCorrect = option.isCorrect;

                        let className = "text-sm py-1 px-2 rounded flex items-center gap-2";
                        if (isSelected && isCorrect) {
                          className +=
                            " bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200";
                        } else if (isSelected && !isCorrect) {
                          className +=
                            " bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200";
                        } else if (!isSelected && isCorrect) {
                          className +=
                            " bg-green-50/50 text-green-700 dark:bg-green-950/50 dark:text-green-300";
                        } else {
                          className += " text-muted-foreground";
                        }

                        return (
                          <div key={option.id} className={className}>
                            {isSelected && isCorrect && (
                              <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                            )}
                            {isSelected && !isCorrect && (
                              <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                            )}
                            {!isSelected && isCorrect && (
                              <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                            )}
                            {!isSelected && !isCorrect && (
                              <span className="w-3 h-3 flex-shrink-0" />
                            )}
                            <span>{option.text}</span>
                            {isSelected && (
                              <span className="text-xs opacity-70 ml-1">
                                {t("yourAnswer")}
                              </span>
                            )}
                            {!isSelected && isCorrect && (
                              <span className="text-xs opacity-70 ml-1">
                                {t("correctAnswer")}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
