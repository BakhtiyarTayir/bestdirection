"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { copyCourse } from "@/actions/course-copy-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";

interface CopyCourseDialogProps {
  sourceCourse: {
    id: string;
    title: string;
    description: string | null;
    teacher: {
      firstName: string;
      lastName: string;
    };
    _count: {
      lessons: number;
      assessments: number;
    };
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyCourseDialog({
  sourceCourse,
  open,
  onOpenChange,
}: CopyCourseDialogProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState(`${sourceCourse.title} (моя версия)`);
  const [isLoading, setIsLoading] = useState(false);

  const handleCopy = async () => {
    if (!title.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название курса",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await copyCourse(sourceCourse.id, { newTitle: title });

      if (result.success) {
        toast({
          title: "Курс скопирован!",
          description: `Создан курс "${result.data.title}"`,
        });
        onOpenChange(false);
        router.push(`/courses/${result.data.id}`);
      } else {
        toast({
          title: "Ошибка",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось скопировать курс",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Копировать курс
          </DialogTitle>
          <DialogDescription>
            Будет создана полная копия курса с вашим авторством
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Исходный курс:
            </p>
            <p className="font-semibold">{sourceCourse.title}</p>
            <p className="text-sm text-muted-foreground">
              Автор: {sourceCourse.teacher.firstName} {sourceCourse.teacher.lastName}
            </p>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span>{sourceCourse._count.lessons} уроков</span>
              <span>{sourceCourse._count.assessments} экзаменов</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="copy-title">Название вашей копии</Label>
            <Input
              id="copy-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите название"
            />
          </div>

          <div className="text-sm space-y-2">
            <p className="font-medium">Будет скопировано:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Все уроки с содержимым
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Все тесты с вопросами и ответами
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Все экзамены с вопросами
              </li>
            </ul>

            <p className="font-medium mt-4">Не копируется:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>- Записанные студенты</li>
              <li>- Прогресс и результаты</li>
              <li>- Посещаемость</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Отмена
          </Button>
          <Button onClick={handleCopy} disabled={isLoading || !title.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Копирование...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Создать копию
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
