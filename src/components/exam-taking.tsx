"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { submitExamAttempt } from "@/actions/exam-actions";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Play,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface ExamQuestion {
  id: string;
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  points: number;
  options: {
    id: string;
    text: string;
  }[];
}

interface ExamTakingProps {
  exam: {
    id: string;
    title: string;
    timeLimitMin: number | null;
    passingScore: number;
    questions: ExamQuestion[];
  };
  courseId: string;
}

type ExamState = "idle" | "taking" | "submitting" | "completed";

interface AttemptResult {
  score: number;
  maxScore: number;
  percentage: number;
  isPassed: boolean;
}

export function ExamTaking({ exam, courseId }: ExamTakingProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [examState, setExamState] = useState<ExamState>("idle");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoSubmittedRef = useRef(false);

  const answeredCount = Object.keys(answers).filter(
    (qId) => answers[qId] && answers[qId].length > 0
  ).length;

  const handleSubmit = useCallback(async () => {
    if (examState !== "taking") return;
    setExamState("submitting");

    try {
      const formattedAnswers = exam.questions.map((q) => ({
        questionId: q.id,
        selectedOptionIds: answers[q.id] || [],
      }));

      const res = await submitExamAttempt({
        examId: exam.id,
        answers: formattedAnswers,
      });

      if (res.success && res.data) {
        setResult({
          score: res.data.score,
          maxScore: res.data.maxScore,
          percentage: res.data.percentage,
          isPassed: res.data.isPassed,
        });
        setExamState("completed");
        router.refresh();
      } else {
        toast({
          title: "Ошибка",
          description: res.error || "Не удалось отправить ответы",
          variant: "destructive",
        });
        setExamState("taking");
      }
    } catch {
      toast({
        title: "Ошибка",
        description: "Произошла непредвиденная ошибка",
        variant: "destructive",
      });
      setExamState("taking");
    }
  }, [examState, exam, answers, router, toast]);

  // Timer
  useEffect(() => {
    if (examState === "taking" && exam.timeLimitMin && timeLeft !== null) {
      if (timeLeft <= 0 && !hasAutoSubmittedRef.current) {
        hasAutoSubmittedRef.current = true;
        toast({
          title: "Время вышло!",
          description: "Экзамен автоматически отправлен.",
          variant: "destructive",
        });
        handleSubmit();
        return;
      }

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null || prev <= 0) return 0;
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [examState, exam.timeLimitMin, timeLeft, handleSubmit, toast]);

  const startExam = () => {
    setExamState("taking");
    setAnswers({});
    hasAutoSubmittedRef.current = false;
    if (exam.timeLimitMin) {
      setTimeLeft(exam.timeLimitMin * 60);
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
  if (examState === "idle") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">{exam.title}</h2>
            <p className="text-muted-foreground">
              {exam.questions.length}{" "}
              {exam.questions.length === 1
                ? "вопрос"
                : exam.questions.length < 5
                ? "вопроса"
                : "вопросов"}
              {exam.timeLimitMin && ` / ${exam.timeLimitMin} мин`}
            </p>
            <Button onClick={startExam} size="lg">
              <Play className="h-5 w-5 mr-2" />
              Начать экзамен
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // COMPLETED state
  if (examState === "completed" && result) {
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
              {result.isPassed ? "Экзамен сдан!" : "Экзамен не сдан"}
            </h2>
            <div className="space-y-2">
              <p className="text-lg">
                Результат: {result.score} / {result.maxScore} ({result.percentage}%)
              </p>
              <Badge
                variant={result.isPassed ? "default" : "destructive"}
                className="text-sm"
              >
                {result.isPassed ? "Зачтено" : "Не зачтено"}
              </Badge>
              <p className="text-sm text-muted-foreground">
                Проходной балл: {exam.passingScore}%
              </p>
            </div>
            <Button
              onClick={() => router.refresh()}
              variant="outline"
            >
              Посмотреть детали
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // SUBMITTING state
  if (examState === "submitting") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4 py-8">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="text-lg">Отправка ответов...</p>
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
                Отвечено: {answeredCount} / {exam.questions.length}
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
            value={(answeredCount / exam.questions.length) * 100}
          />
        </CardContent>
      </Card>

      {/* Question navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {exam.questions.map((q, index) => {
              const isAnswered =
                answers[q.id] && answers[q.id].length > 0;
              return (
                <a
                  key={q.id}
                  href={`#exam-question-${index}`}
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
      {exam.questions.map((question, index) => (
        <Card key={question.id} id={`exam-question-${index}`}>
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
                    ? "Один ответ"
                    : "Несколько ответов"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {question.points}{" "}
                  {question.points === 1
                    ? "балл"
                    : question.points < 5
                    ? "балла"
                    : "баллов"}
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
                      id={`exam-opt-${option.id}`}
                    />
                    <Label
                      htmlFor={`exam-opt-${option.id}`}
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
                        id={`exam-opt-${option.id}`}
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
                        htmlFor={`exam-opt-${option.id}`}
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
              {answeredCount < exam.questions.length && (
                <div className="flex items-center gap-2 text-orange-500">
                  <AlertTriangle className="h-4 w-4" />
                  Вы ответили не на все вопросы ({answeredCount} из{" "}
                  {exam.questions.length})
                </div>
              )}
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg">
                  <Send className="h-4 w-4 mr-2" />
                  Завершить экзамен
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Завершить экзамен?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Вы ответили на {answeredCount} из {exam.questions.length}{" "}
                    вопросов. После отправки изменить ответы будет невозможно.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Вернуться к экзамену</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>
                    Отправить ответы
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
