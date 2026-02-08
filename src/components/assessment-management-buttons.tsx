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
import { deleteAssessment, deleteAssessmentQuestion } from "@/actions/assessment-actions";
import { Trash2, Loader2 } from "lucide-react";

// ---------- DeleteAssessmentButton ----------

interface DeleteAssessmentButtonProps {
  assessmentId: string;
  type: "TEST" | "EXAM";
}

export function DeleteAssessmentButton({ assessmentId, type }: DeleteAssessmentButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const label = type === "TEST" ? "тест" : "экзамен";

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteAssessment(assessmentId);

        if (result.success) {
          toast({
            title: "Успешно",
            description: `${type === "TEST" ? "Тест" : "Экзамен"} удален`,
          });
          router.refresh();
        } else {
          toast({
            title: "Ошибка",
            description: result.error || `Не удалось удалить ${label}`,
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
          <AlertDialogTitle>Удалить {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Это действие необратимо. Будут удалены все вопросы и попытки прохождения.
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

// ---------- DeleteAssessmentQuestionButton ----------

interface DeleteAssessmentQuestionButtonProps {
  questionId: string;
}

export function DeleteAssessmentQuestionButton({ questionId }: DeleteAssessmentQuestionButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteAssessmentQuestion(questionId);

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
