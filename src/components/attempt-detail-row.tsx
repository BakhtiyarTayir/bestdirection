"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface AttemptAnswer {
  id: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  pointsEarned: number;
  question: {
    id: string;
    text: string;
    points: number;
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
    }[];
  };
}

interface AttemptDetailRowProps {
  attempt: {
    id: string;
    score: number;
    maxScore: number;
    percentage: number;
    isPassed: boolean;
    startedAt: string;
    studentName: string;
    studentEmail: string;
    answers: AttemptAnswer[];
  };
  colSpan: number;
}

export function AttemptDetailRow({ attempt, colSpan }: AttemptDetailRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="font-medium">
          {attempt.studentName}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {attempt.studentEmail}
        </TableCell>
        <TableCell className="text-center">
          {attempt.score} / {attempt.maxScore}
        </TableCell>
        <TableCell className="text-center">
          {attempt.percentage}%
        </TableCell>
        <TableCell className="text-center">
          <Badge
            variant={attempt.isPassed ? "default" : "destructive"}
          >
            {attempt.isPassed ? "Зачтено" : "Не зачтено"}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          <div className="flex items-center justify-between">
            <span>{attempt.startedAt}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-2">
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={colSpan} className="p-0">
            <div className="bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Ответы на вопросы:
              </p>
              {attempt.answers.map((answer, index) => (
                <div key={answer.id} className="space-y-2">
                  {index > 0 && <Separator />}
                  <div className="flex items-start gap-2 pt-1">
                    {answer.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">
                          <span className="text-muted-foreground mr-1">{index + 1}.</span>
                          {answer.question.text}
                        </p>
                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                          {answer.pointsEarned} / {answer.question.points}{" "}
                          {answer.question.points === 1 ? "балл" : answer.question.points < 5 ? "балла" : "баллов"}
                        </span>
                      </div>
                      <div className="space-y-1 ml-2">
                        {answer.question.options.map((option) => {
                          const isSelected = answer.selectedOptionIds.includes(option.id);
                          const isCorrect = option.isCorrect;

                          let className = "text-sm py-1 px-2 rounded flex items-center gap-2";
                          if (isSelected && isCorrect) {
                            className += " bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200";
                          } else if (isSelected && !isCorrect) {
                            className += " bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200";
                          } else if (!isSelected && isCorrect) {
                            className += " bg-green-50/50 text-green-700 dark:bg-green-950/50 dark:text-green-300";
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
                                <span className="text-xs opacity-70 ml-1">(ответ студента)</span>
                              )}
                              {!isSelected && isCorrect && (
                                <span className="text-xs opacity-70 ml-1">(правильный ответ)</span>
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
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
