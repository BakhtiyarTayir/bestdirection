"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { submitAssessmentAttempt } from "@/actions/assessment-actions";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Play,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { AssessmentType } from "@/validators/assessment";

interface AssessmentQuestion {
  id: string;
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  points: number;
  options: {
    id: string;
    text: string;
  }[];
}

interface AssessmentTakingProps {
  assessment: {
    id: string;
    type: AssessmentType;
    title: string;
    timeLimitMin: number | null;
    passingScore: number;
    questions: AssessmentQuestion[];
  };
}

type TakingState = "idle" | "taking" | "submitting" | "completed";

interface AttemptResult {
  score: number;
  maxScore: number;
  percentage: number;
  isPassed: boolean;
}

export function AssessmentTaking({ assessment }: AssessmentTakingProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<TakingState>("idle");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoSubmittedRef = useRef(false);
  const t = useTranslations("assessments");
  const tErrors = useTranslations("errors");

  const isTest = assessment.type === "TEST";
  const idPrefix = isTest ? "q" : "eq";

  const answeredCount = Object.keys(answers).filter(
    (qId) => answers[qId] && answers[qId].length > 0
  ).length;

  const handleSubmit = useCallback(async () => {
    if (state !== "taking") return;
    setState("submitting");

    try {
      const formattedAnswers = assessment.questions.map((q) => ({
        questionId: q.id,
        selectedOptionIds: answers[q.id] || [],
      }));

      const res = await submitAssessmentAttempt({
        assessmentId: assessment.id,
        answers: formattedAnswers,
      });

      if (res.success && res.data) {
        setResult({
          score: res.data.score,
          maxScore: res.data.maxScore,
          percentage: res.data.percentage,
          isPassed: res.data.isPassed,
        });
        setState("completed");
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: res.error || t("submitFailed"),
          variant: "destructive",
        });
        setState("taking");
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
      setState("taking");
    }
  }, [state, assessment, answers, router, toast, t, tErrors]);

  // Timer
  useEffect(() => {
    if (state !== "taking" || !assessment.timeLimitMin || timeLeft === null) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) return 0;

        if (prev <= 1 && !hasAutoSubmittedRef.current) {
          hasAutoSubmittedRef.current = true;
          toast({
            title: t("timeUp"),
            description: isTest ? t("testAutoSubmitted") : t("examAutoSubmitted"),
            variant: "destructive",
          });
          setTimeout(() => {
            void handleSubmit();
          }, 0);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state, assessment.timeLimitMin, timeLeft, handleSubmit, toast, isTest, t]);

  const startAssessment = () => {
    if (isStarting) return;
    setIsStarting(true);
    setState("taking");
    setAnswers({});
    hasAutoSubmittedRef.current = false;
    if (assessment.timeLimitMin) {
      setTimeLeft(assessment.timeLimitMin * 60);
    }
  };

  const handleSingleChoice = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: [optionId],
    }));
  };

  const handleMultipleChoice = (
    questionId: string,
    optionId: string,
    checked: boolean
  ) => {
    setAnswers((prev) => {
      const current = prev[questionId] || [];
      if (checked) {
        return { ...prev, [questionId]: [...current, optionId] };
      } else {
        return {
          ...prev,
          [questionId]: current.filter((id) => id !== optionId),
        };
      }
    });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // IDLE state
  if (state === "idle") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">{assessment.title}</h2>
            <p className="text-muted-foreground">
              {assessment.questions.length}{" "}
              {assessment.questions.length === 1
                ? t("questionOne")
                : assessment.questions.length < 5
                ? t("questionFew")
                : t("questionMany")}
              {assessment.timeLimitMin && ` / ${assessment.timeLimitMin} ${t("minutesShort")}`}
            </p>
            <Button onClick={startAssessment} size="lg" disabled={isStarting}>
              <Play className="h-5 w-5 mr-2" />
              {isTest ? t("startTest") : t("startExam")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // COMPLETED state
  if (state === "completed" && result) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            {result.isPassed ? (
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            ) : (
              <XCircle className="h-16 w-16 text-red-500 mx-auto" />
            )}
            <h2 className="text-2xl font-bold">
              {result.isPassed
                ? (isTest ? t("testPassed") : t("examPassed"))
                : (isTest ? t("testFailed") : t("examFailed"))}
            </h2>
            <div className="space-y-2">
              <p className="text-lg">
                {t("result", { score: result.score, maxScore: result.maxScore, percentage: result.percentage })}
              </p>
              <Badge
                variant={result.isPassed ? "default" : "destructive"}
                className="text-sm"
              >
                {result.isPassed ? t("passed") : t("failed")}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {t("passingScoreInfo", { score: assessment.passingScore })}
              </p>
            </div>
            <Button onClick={() => router.refresh()} variant="outline">
              {t("viewDetails")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // SUBMITTING state
  if (state === "submitting") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4 py-8">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="text-lg">{t("submittingAnswers")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // TAKING state
  return (
    <div className="space-y-4">
      {/* Timer and progress bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("answered", { answered: answeredCount, total: assessment.questions.length })}
              </span>
            </div>
            {timeLeft !== null && (
              <div
                className={`flex items-center gap-2 text-sm font-mono ${
                  timeLeft <= 60
                    ? "text-red-500 font-bold"
                    : timeLeft <= 300
                    ? "text-orange-500"
                    : "text-muted-foreground"
                }`}
              >
                <Clock className="h-4 w-4" />
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
          <Progress
            value={(answeredCount / assessment.questions.length) * 100}
          />
        </CardContent>
      </Card>

      {/* Question navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {assessment.questions.map((q, index) => {
              const isAnswered =
                answers[q.id] && answers[q.id].length > 0;
              return (
                <a
                  key={q.id}
                  href={`#${idPrefix}-${index}`}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-md text-sm font-medium border transition-colors ${
                    isAnswered
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-input"
                  }`}
                >
                  {index + 1}
                </a>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      {assessment.questions.map((question, index) => (
        <Card key={question.id} id={`${idPrefix}-${index}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                <span className="text-muted-foreground mr-2">
                  {index + 1}.
                </span>
                {question.text}
              </CardTitle>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <Badge variant="outline" className="text-xs">
                  {question.type === "SINGLE_CHOICE"
                    ? t("singleChoice")
                    : t("multipleChoice")}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {question.points}{" "}
                  {question.points === 1
                    ? t("pointOne")
                    : question.points < 5
                    ? t("pointFew")
                    : t("pointMany")}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {question.type === "SINGLE_CHOICE" ? (
              <RadioGroup
                value={answers[question.id]?.[0] || ""}
                onValueChange={(value) =>
                  handleSingleChoice(question.id, value)
                }
                className="space-y-2"
              >
                {question.options.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center space-x-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem
                      value={option.id}
                      id={`${idPrefix}-opt-${option.id}`}
                    />
                    <Label
                      htmlFor={`${idPrefix}-opt-${option.id}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      {option.text}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <div className="space-y-2">
                {question.options.map((option) => {
                  const isChecked =
                    answers[question.id]?.includes(option.id) || false;
                  return (
                    <div
                      key={option.id}
                      className="flex items-center space-x-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`${idPrefix}-opt-${option.id}`}
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          handleMultipleChoice(
                            question.id,
                            option.id,
                            checked as boolean
                          )
                        }
                      />
                      <Label
                        htmlFor={`${idPrefix}-opt-${option.id}`}
                        className="flex-1 cursor-pointer font-normal"
                      >
                        {option.text}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Submit button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {answeredCount < assessment.questions.length && (
                <div className="flex items-center gap-2 text-orange-500">
                  <AlertTriangle className="h-4 w-4" />
                  {t("notAllAnsweredWarning", { answered: answeredCount, total: assessment.questions.length })}
                </div>
              )}
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg">
                  <Send className="h-4 w-4 mr-2" />
                  {isTest ? t("submitTest") : t("submitExam")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{isTest ? t("submitConfirmTitle") : t("submitExamConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("submitConfirmDescription", { answered: answeredCount, total: assessment.questions.length })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {isTest ? t("backToTest") : t("backToExam")}
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>
                    {t("submitAnswers")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
