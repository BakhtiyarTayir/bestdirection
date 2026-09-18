"use client";

import { useOptimistic, useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { deleteLesson } from "@/lib/api/lessons";
import { Video, FileText, Edit, Trash2, Eye, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";

interface Lesson {
  id: string;
  slug: string;
  title: string;
  videoUrl?: string | null;
  isPublished: boolean;
  sortOrder: number;
  assessment?: { id: string } | null;
}

interface LessonListProps {
  initialLessons: Lesson[];
  courseSlug: string;
  isTeacherOrAdmin: boolean;
}

export function LessonList({ initialLessons, courseSlug, isTeacherOrAdmin }: LessonListProps) {
  const t = useTranslations("lessons");
  const tCommon = useTranslations("common");
  const tSuccess = useTranslations("success");
  const tErrors = useTranslations("errors");
  const tAssessments = useTranslations("assessments");
  const { toast } = useToast();
  const router = useRouter();
  const [optimisticLessons, removeLesson] = useOptimistic(
    initialLessons,
    (state: Lesson[], removedId: string) =>
      state.filter((l) => l.id !== removedId)
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  const handleDelete = async () => {
    if (!selectedLesson) return;
    const lessonId = selectedLesson.id;

    setDeletingId(lessonId);
    setDialogOpen(false);
    removeLesson(lessonId);

    try {
      const result = await deleteLesson(lessonId);
      if (result.success) {
        toast({
          title: tSuccess("success"),
          description: t("lessonDeleted"),
        });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error || t("deleteError"),
          variant: "destructive",
        });
        router.refresh();
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: t("deleteError"),
        variant: "destructive",
      });
      router.refresh();
    } finally {
      setDeletingId(null);
      setSelectedLesson(null);
    }
  };

  if (optimisticLessons.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{t("noLessons")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {optimisticLessons.map((lesson) => (
          <Card key={lesson.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                <span className="text-sm font-mono w-8 text-center">
                  {lesson.sortOrder}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {lesson.videoUrl ? (
                  <Video className="h-5 w-5 text-blue-500" />
                ) : (
                  <FileText className="h-5 w-5 text-green-500" />
                )}
              </div>

              <Link
                href={`/courses/${courseSlug}/lessons/${lesson.slug}`}
                className="flex-1 hover:underline font-medium"
              >
                {lesson.title}
              </Link>

              <div className="flex items-center gap-2">
                {lesson.isPublished ? (
                  <Badge variant="default">{tCommon("published")}</Badge>
                ) : (
                  <Badge variant="secondary">{tCommon("draft")}</Badge>
                )}

                {lesson.assessment && (
                  <Badge variant="outline">{tAssessments("test")}</Badge>
                )}
              </div>

              {isTeacherOrAdmin && (
                <div className="flex items-center gap-1">
                  <Link href={`/courses/${courseSlug}/lessons/${lesson.slug}`}>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href={`/courses/${courseSlug}/lessons/${lesson.slug}/edit`}>
                    <Button variant="ghost" size="icon">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingId === lesson.id}
                    onClick={() => {
                      setSelectedLesson(lesson);
                      setDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              onClick={() => setDialogOpen(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
