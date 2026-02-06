"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { createTest, updateTest } from "@/actions/test-actions";
import { Loader2, Save } from "lucide-react";

interface TestSettingsFormProps {
  test?: {
    id: string;
    title: string;
    passingScore: number;
    timeLimitMin: number | null;
    maxAttempts: number;
    isPublished: boolean;
  };
  lessonId: string;
  courseId: string;
}

export function TestSettingsForm({ test, lessonId, courseId }: TestSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(test?.title || "");
  const [passingScore, setPassingScore] = useState(test?.passingScore ?? 60);
  const [timeLimitMin, setTimeLimitMin] = useState<string>(
    test?.timeLimitMin?.toString() || ""
  );
  const [maxAttempts, setMaxAttempts] = useState(test?.maxAttempts ?? 1);
  const [isPublished, setIsPublished] = useState(test?.isPublished ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название теста",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        if (test) {
          // Update existing test
          const result = await updateTest(test.id, {
            title: title.trim(),
            passingScore,
            timeLimitMin: timeLimitMin ? parseInt(timeLimitMin) : null,
            maxAttempts,
            isPublished,
          });

          if (result.success) {
            toast({
              title: "Успешно",
              description: "Настройки теста обновлены",
            });
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error || "Не удалось обновить тест",
              variant: "destructive",
            });
          }
        } else {
          // Create new test
          const result = await createTest({
            title: title.trim(),
            passingScore,
            timeLimitMin: timeLimitMin ? parseInt(timeLimitMin) : undefined,
            maxAttempts,
            isPublished,
            lessonId,
          });

          if (result.success) {
            toast({
              title: "Успешно",
              description: "Тест создан",
            });
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error || "Не удалось создать тест",
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
          <Label htmlFor="title">Название теста</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Тест по теме 1"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="passingScore">Проходной балл (%)</Label>
          <Input
            id="passingScore"
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(parseInt(e.target.value) || 0)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeLimitMin">
            Ограничение по времени (мин)
          </Label>
          <Input
            id="timeLimitMin"
            type="number"
            min={1}
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
            placeholder="Без ограничения"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maxAttempts">Количество попыток</Label>
          <Input
            id="maxAttempts"
            type="number"
            min={1}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center space-x-3 pt-6">
          <Switch
            id="isPublished"
            checked={isPublished}
            onCheckedChange={setIsPublished}
            disabled={isPending}
          />
          <Label htmlFor="isPublished">Опубликован</Label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {test ? "Сохранить изменения" : "Создать тест"}
        </Button>
      </div>
    </form>
  );
}
