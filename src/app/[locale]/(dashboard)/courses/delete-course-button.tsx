"use client";

import { useState } from "react";
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
import { deleteCourse } from "@/lib/api/courses";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteCourseButtonProps {
  courseId: string;
  courseTitle: string;
  enrollmentsCount: number;
}

export function DeleteCourseButton({
  courseId,
  courseTitle,
  enrollmentsCount,
}: DeleteCourseButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("courses");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const result = await deleteCourse(courseId);
      if (result.success) {
        toast({
          title: t("courseDeleted"),
          description: t("courseDeletedDescription", { title: courseTitle }),
        });
        // Курс уехал в Корзину — на этой странице его больше нет, уводим в список.
        router.push("/courses");
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error ?? t("deleteCourseFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
          {t("deleteCourse")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteCourse")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteCourseConfirm", { title: courseTitle })}{" "}
            {t("deleteCourseTrashNote")}
            {enrollmentsCount > 0 && (
              <span className="mt-2 block font-medium text-destructive">
                {t("deleteCourseHasStudents", { count: enrollmentsCount })}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {tCommon("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
