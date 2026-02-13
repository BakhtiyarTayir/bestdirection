"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
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
import { useTranslations } from "next-intl";

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
  const t = useTranslations("lessons");
  const tCommon = useTranslations("common");
  const tSuccess = useTranslations("success");
  const tErrors = useTranslations("errors");
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
          title: tSuccess("success"),
          description: t("lessonDeleted"),
        });
        setOpen(false);
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error || t("deleteError"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: t("deleteError"),
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
          <DialogTitle>{t("deleteLesson")}</DialogTitle>
          <DialogDescription>
            {t("deleteConfirm")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isDeleting}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? tCommon("deleting") : tCommon("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
