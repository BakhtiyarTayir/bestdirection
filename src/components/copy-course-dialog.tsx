"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
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
import { useTranslations } from "next-intl";

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
  const t = useTranslations("copyCourse");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState(`${sourceCourse.title} (${t("myVersion")})`);
  const [isLoading, setIsLoading] = useState(false);

  const handleCopy = async () => {
    if (!title.trim()) {
      toast({
        title: tErrors("error"),
        description: t("enterTitle"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await copyCourse(sourceCourse.id, { newTitle: title });

      if (result.success) {
        toast({
          title: t("courseCopied"),
          description: t("courseCreated", { title: result.data.title }),
        });
        onOpenChange(false);
        router.push(`/courses/${result.data.slug}`);
      } else {
        toast({
          title: tErrors("error"),
          description: result.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: t("copyFailed"),
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
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t("sourceLabel")}
            </p>
            <p className="font-semibold">{sourceCourse.title}</p>
            <p className="text-sm text-muted-foreground">
              {t("author", { name: `${sourceCourse.teacher.firstName} ${sourceCourse.teacher.lastName}` })}
            </p>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span>{t("lessonsCount", { count: sourceCourse._count.lessons })}</span>
              <span>{t("examsCount", { count: sourceCourse._count.assessments })}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="copy-title">{t("newTitle")}</Label>
            <Input
              id="copy-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("newTitlePlaceholder")}
            />
          </div>

          <div className="text-sm space-y-2">
            <p className="font-medium">{t("willBeCopied")}</p>
            <ul className="space-y-1 text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t("allLessons")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t("allTestsWithAnswers")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t("allExamsWithQuestions")}
              </li>
            </ul>

            <p className="font-medium mt-4">{t("willNotBeCopied")}</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>{t("enrolledStudents")}</li>
              <li>{t("progressAndResults")}</li>
              <li>{t("attendanceData")}</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleCopy} disabled={isLoading || !title.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tCommon("copying")}
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                {tCommon("copy")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
