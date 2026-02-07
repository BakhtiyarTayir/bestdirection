"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { deleteExam, deleteExamQuestion } from "@/actions/exam-actions";
import { Trash2, Loader2 } from "lucide-react";

// ---------- DeleteExamButton ----------

interface DeleteExamButtonProps {
  examId: string;
  courseId: string;
}

export function DeleteExamButton({ examId, courseId }: DeleteExamButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteExam(examId);

        if (result.success) {
          toast({
            title: "Успешно",
            description: "Экзамен удален",
          });
          router.push(`/courses/${courseId}/exams`);
          router.refresh();
        } else {
          toast({
            title: "Ошибка",
            description: result.error || "Не удалось удалить экзамен",
            variant: "destructive",
          });
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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить экзамен?</AlertDialogTitle>
          <AlertDialogDescription>
            Это действие необратимо. Будут удалены все вопросы и попытки прохождения экзамена.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- DeleteExamQuestionButton ----------

interface DeleteExamQuestionButtonProps {
  questionId: string;
}

export function DeleteExamQuestionButton({ questionId }: DeleteExamQuestionButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteExamQuestion(questionId);

        if (result.success) {
          toast({
            title: "Успешно",
            description: "Вопрос удален",
          });
          router.refresh();
        } else {
          toast({
            title: "Ошибка",
            description: result.error || "Не удалось удалить вопрос",
            variant: "destructive",
          });
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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 text-destructive" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить вопрос?</AlertDialogTitle>
          <AlertDialogDescription>
            Это действие необратимо. Вопрос и все связанные с ним ответы будут удалены.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
