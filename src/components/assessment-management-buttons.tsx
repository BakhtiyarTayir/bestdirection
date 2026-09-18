"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
import { deleteAssessment, deleteAssessmentQuestion } from "@/lib/api/lessons";
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
  const t = useTranslations("assessments");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");

  const isTest = type === "TEST";

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteAssessment(assessmentId);

        if (result.success) {
          toast({
            title: tCommon("delete"),
            description: isTest ? t("testDeleted") : t("examDeleted"),
          });
          router.refresh();
        } else {
          toast({
            title: tErrors("error"),
            description: result.error || (isTest ? t("deleteTestFailed") : t("deleteExamFailed")),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: tErrors("error"),
          description: tErrors("unexpected"),
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
          <AlertDialogTitle>{isTest ? t("deleteTestConfirm") : t("deleteExamConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteTestDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>
            {tCommon("delete")}
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
  const t = useTranslations("assessments");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteAssessmentQuestion(questionId);

        if (result.success) {
          toast({
            title: tCommon("delete"),
            description: t("questionDeleted"),
          });
          router.refresh();
        } else {
          toast({
            title: tErrors("error"),
            description: result.error || t("deleteQuestionFailed"),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: tErrors("error"),
          description: tErrors("unexpected"),
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
          <AlertDialogTitle>{t("deleteQuestionConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteQuestionDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>
            {tCommon("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
