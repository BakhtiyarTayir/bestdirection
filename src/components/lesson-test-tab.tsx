"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Target,
  RotateCcw,
  CheckCircle2,
  XCircle,
  BarChart3,
  FileText,
} from "lucide-react";
import { AssessmentForm } from "@/components/assessment-form";
import { AssessmentQuestionForm } from "@/components/assessment-question-form";
import { DeleteAssessmentButton, DeleteAssessmentQuestionButton } from "@/components/assessment-management-buttons";
import { ExportButton, ImportButton } from "@/components/export-import-buttons";

interface AssessmentOption {
  id: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
}

interface AssessmentQuestion {
  id: string;
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  points: number;
  sortOrder: number;
  options: AssessmentOption[];
}

export interface LessonTestTabAssessment {
  id: string;
  title: string;
  description: string | null;
  passingScore: number;
  timeLimitMin: number | null;
  maxAttempts: number;
  isPublished: boolean;
  questions: AssessmentQuestion[];
  _count: { attempts: number };
}

interface LessonTestTabProps {
  courseId: string;
  lessonId: string;
  assessment: LessonTestTabAssessment | null;
}

export function LessonTestTab({ courseId, lessonId, assessment }: LessonTestTabProps) {
  if (!assessment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Создать тест
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <p className="text-muted-foreground">
              Для этого урока еще не создан тест. Заполните форму ниже или импортируйте из файла.
            </p>
            <ImportButton type="test" targetId={lessonId} />
          </div>
          <AssessmentForm type="TEST" courseId={courseId} lessonId={lessonId} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Assessment Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Настройки теста
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={assessment.isPublished ? "default" : "secondary"}>
                {assessment.isPublished ? "Опубликован" : "Черновик"}
              </Badge>
              <Link href={`/courses/${courseId}/lessons/${lessonId}/test/attempts`}>
                <Button variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Результаты ({assessment._count.attempts})
                </Button>
              </Link>
              <ExportButton type="test" id={lessonId} />
              <DeleteAssessmentButton assessmentId={assessment.id} type="TEST" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AssessmentForm
            type="TEST"
            courseId={courseId}
            lessonId={lessonId}
            assessment={{
              id: assessment.id,
              title: assessment.title,
              description: assessment.description,
              passingScore: assessment.passingScore,
              timeLimitMin: assessment.timeLimitMin,
              maxAttempts: assessment.maxAttempts,
              isPublished: assessment.isPublished,
            }}
          />
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Вопросы ({assessment.questions.length})
            </CardTitle>
            <AssessmentQuestionForm assessmentId={assessment.id} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {assessment.questions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Вопросов пока нет. Добавьте первый вопрос.
            </p>
          ) : (
            assessment.questions.map((question, index) => (
              <div key={question.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-muted-foreground">
                        Вопрос {index + 1}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {question.type === "SINGLE_CHOICE"
                          ? "Один ответ"
                          : "Несколько ответов"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {question.points} {question.points === 1 ? "балл" : question.points < 5 ? "балла" : "баллов"}
                      </Badge>
                    </div>
                    <p className="font-medium">{question.text}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <AssessmentQuestionForm
                      assessmentId={assessment.id}
                      question={{
                        id: question.id,
                        text: question.text,
                        type: question.type,
                        points: question.points,
                        sortOrder: question.sortOrder,
                        options: question.options.map((o) => ({
                          id: o.id,
                          text: o.text,
                          isCorrect: o.isCorrect,
                          sortOrder: o.sortOrder,
                        })),
                      }}
                    />
                    <DeleteAssessmentQuestionButton questionId={question.id} />
                  </div>
                </div>
                <div className="space-y-1.5 ml-4">
                  {question.options.map((option) => (
                    <div
                      key={option.id}
                      className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${
                        option.isCorrect
                          ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                          : ""
                      }`}
                    >
                      {option.isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span>{option.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Test Info Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Target className="h-4 w-4" />
                <span className="text-xs">Проходной балл</span>
              </div>
              <p className="text-lg font-semibold">{assessment.passingScore}%</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Ограничение</span>
              </div>
              <p className="text-lg font-semibold">
                {assessment.timeLimitMin ? `${assessment.timeLimitMin} мин` : "Нет"}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <RotateCcw className="h-4 w-4" />
                <span className="text-xs">Попытки</span>
              </div>
              <p className="text-lg font-semibold">{assessment.maxAttempts}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs">Макс. баллов</span>
              </div>
              <p className="text-lg font-semibold">
                {assessment.questions.reduce((sum, q) => sum + q.points, 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
