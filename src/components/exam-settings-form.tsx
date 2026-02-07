"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { createExam, updateExam } from "@/actions/exam-actions";
import { Loader2, Save } from "lucide-react";

interface ExamSettingsFormProps {
  exam?: {
    id: string;
    title: string;
    description: string | null;
    passingScore: number;
    timeLimitMin: number | null;
    maxAttempts: number;
    isPublished: boolean;
  };
  courseId: string;
}

export function ExamSettingsForm({ exam, courseId }: ExamSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(exam?.title || "");
  const [description, setDescription] = useState(exam?.description || "");
  const [passingScore, setPassingScore] = useState(exam?.passingScore ?? 60);
  const [timeLimitMin, setTimeLimitMin] = useState<string>(
    exam?.timeLimitMin?.toString() || ""
  );
  const [maxAttempts, setMaxAttempts] = useState(exam?.maxAttempts ?? 1);
  const [isPublished, setIsPublished] = useState(exam?.isPublished ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название экзамена",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        if (exam) {
          const result = await updateExam(exam.id, {
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
              description: "Настройки экзамена обновлены",
            });
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error || "Не удалось обновить экзамен",
              variant: "destructive",
            });
          }
        } else {
          const result = await createExam({
            title: title.trim(),
            description: description.trim() || undefined,
            passingScore,
            timeLimitMin: timeLimitMin ? parseInt(timeLimitMin) : undefined,
            maxAttempts,
            isPublished,
            courseId,
          });

          if (result.success) {
            toast({
              title: "Успешно",
              description: "Экзамен создан",
            });
            router.push(`/courses/${courseId}/exams`);
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error || "Не удалось создать экзамен",
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
          <Label htmlFor="exam-title">Название экзамена</Label>
          <Input
            id="exam-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Финальный экзамен"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="exam-description">Описание (необязательно)</Label>
          <Textarea
            id="exam-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание экзамена..."
            rows={3}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-passingScore">Проходной балл (%)</Label>
          <Input
            id="exam-passingScore"
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(parseInt(e.target.value) || 0)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-timeLimitMin">
            Ограничение по времени (мин)
          </Label>
          <Input
            id="exam-timeLimitMin"
            type="number"
            min={1}
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
            placeholder="Без ограничения"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-maxAttempts">Количество попыток</Label>
          <Input
            id="exam-maxAttempts"
            type="number"
            min={1}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center space-x-3 pt-6">
          <Switch
            id="exam-isPublished"
            checked={isPublished}
            onCheckedChange={setIsPublished}
            disabled={isPending}
          />
          <Label htmlFor="exam-isPublished">Опубликован</Label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {exam ? "Сохранить изменения" : "Создать экзамен"}
        </Button>
      </div>
    </form>
  );
}
