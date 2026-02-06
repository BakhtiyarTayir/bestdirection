"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Trash2 } from "lucide-react";
import { deleteLesson } from "@/actions/lesson-actions";

interface DeleteLessonButtonProps {
  lessonId: string;
  courseId: string;
  lessonTitle: string;
}

export function DeleteLessonButton({
  lessonId,
  courseId,
  lessonTitle,
}: DeleteLessonButtonProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await deleteLesson(lessonId);
      if (result.success) {
        toast({
          title: "Успешно",
          description: "Урок удален",
        });
        setOpen(false);
        router.refresh();
      } else {
        toast({
          title: "Ошибка",
          description: result.error || "Не удалось удалить урок",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить урок",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить урок</DialogTitle>
          <DialogDescription>
            Вы уверены, что хотите удалить урок &laquo;{lessonTitle}&raquo;?
            Это действие нельзя отменить. Все связанные тесты и результаты
            также будут удалены.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isDeleting}
          >
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Удаление..." : "Удалить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
