"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { createAssessment, updateAssessment } from "@/actions/assessment-actions";
import { Loader2, Save } from "lucide-react";
import type { AssessmentType } from "@/validators/assessment";

interface AssessmentFormProps {
  type: AssessmentType;
  courseId: string;
  lessonId?: string;
  assessment?: {
    id: string;
    title: string;
    description: string | null;
    passingScore: number;
    timeLimitMin: number | null;
    maxAttempts: number;
    isPublished: boolean;
  };
}

export function AssessmentForm({ type, courseId, lessonId, assessment }: AssessmentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const isTest = type === "TEST";
  const label = isTest ? "тест" : "экзамен";

  const [title, setTitle] = useState(assessment?.title || "");
  const [description, setDescription] = useState(assessment?.description || "");
  const [passingScore, setPassingScore] = useState(assessment?.passingScore ?? 60);
  const [timeLimitMin, setTimeLimitMin] = useState<string>(
    assessment?.timeLimitMin?.toString() || ""
  );
  const [maxAttempts, setMaxAttempts] = useState(assessment?.maxAttempts ?? 1);
  const [isPublished, setIsPublished] = useState(assessment?.isPublished ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: "Ошибка",
        description: `Введите название ${isTest ? "теста" : "экзамена"}`,
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        if (assessment) {
          const result = await updateAssessment(assessment.id, {
            title: title.trim(),
            description: description.trim() || null,
            passingScore,
            timeLimitMin: timeLimitMin ? parseInt(timeLimitMin) : null,
            maxAttempts,
            isPublished,
          });

          if (result.success) {
            toast({
              title: "Успешно",
              description: `Настройки ${isTest ? "теста" : "экзамена"} обновлены`,
            });
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error || `Не удалось обновить ${label}`,
              variant: "destructive",
            });
          }
        } else {
          const result = await createAssessment({
            type,
            title: title.trim(),
            description: description.trim() || undefined,
            passingScore,
            timeLimitMin: timeLimitMin ? parseInt(timeLimitMin) : undefined,
            maxAttempts,
            isPublished,
            courseId,
            lessonId: isTest ? lessonId : undefined,
          });

          if (result.success) {
            toast({
              title: "Успешно",
              description: `${isTest ? "Тест" : "Экзамен"} создан`,
            });
            if (isTest) {
              router.refresh();
            } else {
              router.push(`/courses/${courseId}/exams`);
              router.refresh();
            }
          } else {
            toast({
              title: "Ошибка",
              description: result.error || `Не удалось создать ${label}`,
              variant: "destructive",
            });
          }
        }
      } catch {
        toast({
          title: "Ошибка",
          description: "Произошла непредвиденная ошибка",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="assessment-title">
            Название {isTest ? "теста" : "экзамена"}
          </Label>
          <Input
            id="assessment-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isTest ? "Например: Тест по теме 1" : "Например: Финальный экзамен"}
            disabled={isPending}
          />
        </div>

        {!isTest && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="assessment-description">Описание (необязательно)</Label>
            <Textarea
              id="assessment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание экзамена..."
              rows={3}
              disabled={isPending}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="assessment-passingScore">Проходной балл (%)</Label>
          <Input
            id="assessment-passingScore"
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(parseInt(e.target.value) || 0)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-timeLimitMin">
            Ограничение по времени (мин)
          </Label>
          <Input
            id="assessment-timeLimitMin"
            type="number"
            min={1}
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
            placeholder="Без ограничения"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-maxAttempts">Количество попыток</Label>
          <Input
            id="assessment-maxAttempts"
            type="number"
            min={1}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center space-x-3 pt-6">
          <Switch
            id="assessment-isPublished"
            checked={isPublished}
            onCheckedChange={setIsPublished}
            disabled={isPending}
          />
          <Label htmlFor="assessment-isPublished">Опубликован</Label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {assessment ? "Сохранить изменения" : `Создать ${label}`}
        </Button>
      </div>
    </form>
  );
}
