"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
import type { ApiAssessment } from "@/lib/api/lessons";

// Форма теста берёт тест из api как есть: свой набор полей быстро расходился
// с тем, что отдаёт сервер
export type LessonTestTabAssessment = ApiAssessment;

interface LessonTestTabProps {
  courseSlug: string;
  lessonSlug: string;
  courseId: string;
  lessonId: string;
  assessment: LessonTestTabAssessment | null;
}

export function LessonTestTab({ courseSlug, lessonSlug, courseId, lessonId, assessment }: LessonTestTabProps) {
  const t = useTranslations("assessments");
  const tCommon = useTranslations("common");

  if (!assessment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("createTestForLesson")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <p className="text-muted-foreground">
              {t("noTestForLesson")}
            </p>
            <ImportButton type="test" targetId={lessonId} />
          </div>
          <AssessmentForm type="TEST" courseId={courseId} courseSlug={courseSlug} lessonId={lessonId} />
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
              {t("testSettings")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={assessment.isPublished ? "default" : "secondary"}>
                {assessment.isPublished ? tCommon("published") : tCommon("draft")}
              </Badge>
              <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/test/attempts`}>
                <Button variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {t("results", { count: assessment._count?.attempts ?? 0 })}
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
            courseSlug={courseSlug}
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
              {t("questions", { count: assessment.questions.length })}
            </CardTitle>
            <AssessmentQuestionForm assessmentId={assessment.id} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {assessment.questions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t("noQuestions")}
            </p>
          ) : (
            assessment.questions.map((question, index) => (
              <div key={question.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-muted-foreground">
                        {t("questionNumber", { number: index + 1 })}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {question.type === "SINGLE_CHOICE"
                          ? t("singleChoice")
                          : t("multipleChoice")}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {question.points} {question.points === 1 ? t("pointOne") : question.points < 5 ? t("pointFew") : t("pointMany")}
                      </Badge>
                    </div>
                    <p className="font-medium whitespace-pre-wrap break-words leading-relaxed">
                      {question.text}
                    </p>
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
                          isCorrect: o.isCorrect ?? false,
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
                <span className="text-xs">{t("passingScoreLabel")}</span>
              </div>
              <p className="text-lg font-semibold">{assessment.passingScore}%</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">{t("timeLimitLabel")}</span>
              </div>
              <p className="text-lg font-semibold">
                {assessment.timeLimitMin ? `${assessment.timeLimitMin} ${t("minutesShort")}` : t("noTimeLimit")}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <RotateCcw className="h-4 w-4" />
                <span className="text-xs">{t("attemptsLabel")}</span>
              </div>
              <p className="text-lg font-semibold">{assessment.maxAttempts}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs">{t("maxPoints")}</span>
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
