"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { createAssessment, updateAssessment } from "@/lib/api/lessons";
import { Loader2, Save } from "lucide-react";
import type { AssessmentType } from "@/validators/assessment";

interface AssessmentFormProps {
  type: AssessmentType;
  courseId: string;
  courseSlug: string;
  lessonId?: string;
  assessment?: {
    id: string;
    title: string;
    description: string | null;
    passingScore: number;
    timeLimitMin: number | null;
    maxAttempts: number;
    isPublished: boolean;
  };
}

export function AssessmentForm({ type, courseId, courseSlug, lessonId, assessment }: AssessmentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("assessments");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const isTest = type === "TEST";

  const [title, setTitle] = useState(assessment?.title || "");
  const [description, setDescription] = useState(assessment?.description || "");
  const [passingScore, setPassingScore] = useState(assessment?.passingScore ?? 60);
  const [timeLimitMin, setTimeLimitMin] = useState<string>(
    assessment?.timeLimitMin?.toString() || ""
  );
  const [maxAttempts, setMaxAttempts] = useState(assessment?.maxAttempts ?? 1);
  const [isPublished, setIsPublished] = useState(assessment?.isPublished ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: tErrors("error"),
        description: isTest ? t("enterTestTitle") : t("enterExamTitle"),
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        if (assessment) {
          const result = await updateAssessment(assessment.id, {
            title: title.trim(),
            description: description.trim() || undefined,
            passingScore,
            timeLimitMin: timeLimitMin ? parseInt(timeLimitMin) : null,
            maxAttempts,
            isPublished,
          });

          if (result.success) {
            toast({
              title: tCommon("save"),
              description: isTest ? t("testUpdated") : t("examUpdated"),
            });
            router.refresh();
          } else {
            toast({
              title: tErrors("error"),
              description: result.error || (isTest ? t("testUpdateFailed") : t("examUpdateFailed")),
              variant: "destructive",
            });
          }
        } else {
          const result = await createAssessment({
            type,
            title: title.trim(),
            description: description.trim() || undefined,
            passingScore,
            timeLimitMin: timeLimitMin ? parseInt(timeLimitMin) : undefined,
            maxAttempts,
            isPublished,
            courseId,
            lessonId: isTest ? lessonId : undefined,
          });

          if (result.success) {
            toast({
              title: tCommon("save"),
              description: isTest ? t("testCreated") : t("examCreated"),
            });
            if (isTest) {
              router.refresh();
            } else {
              router.push(`/courses/${courseSlug}/exams`);
              router.refresh();
            }
          } else {
            toast({
              title: tErrors("error"),
              description: result.error || (isTest ? t("testCreateFailed") : t("examCreateFailed")),
              variant: "destructive",
            });
          }
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="assessment-title">
            {isTest ? t("testTitle") : t("examTitle")}
          </Label>
          <Input
            id="assessment-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isTest ? t("testTitlePlaceholder") : t("examTitlePlaceholder")}
            disabled={isPending}
          />
        </div>

        {!isTest && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="assessment-description">{t("descriptionOptional")}</Label>
            <Textarea
              id="assessment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={3}
              disabled={isPending}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="assessment-passingScore">{t("passingScore")}</Label>
          <Input
            id="assessment-passingScore"
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(parseInt(e.target.value) || 0)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-timeLimitMin">
            {t("timeLimit")}
          </Label>
          <Input
            id="assessment-timeLimitMin"
            type="number"
            min={1}
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
            placeholder={t("noTimeLimit")}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessment-maxAttempts">{t("maxAttempts")}</Label>
          <Input
            id="assessment-maxAttempts"
            type="number"
            min={1}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center space-x-3 pt-6">
          <Switch
            id="assessment-isPublished"
            checked={isPublished}
            onCheckedChange={setIsPublished}
            disabled={isPending}
          />
          <Label htmlFor="assessment-isPublished">{tCommon("published")}</Label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {assessment ? tCommon("saveChanges") : (isTest ? t("createTest") : t("createExam"))}
        </Button>
      </div>
    </form>
  );
}
