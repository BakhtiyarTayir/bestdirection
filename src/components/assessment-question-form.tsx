"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { addAssessmentQuestion, updateAssessmentQuestion } from "@/lib/api/lessons";
import { z } from "zod";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

function createQuestionSchema(tValidation: (key: string) => string) {
  return z.object({
    text: z.string().min(1, tValidation("questionTextRequired")),
    type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE"]),
    points: z.number().int(tValidation("pointsInteger")).min(1, tValidation("minOnePoint")),
    sortOrder: z.number().int().min(0),
    assessmentId: z.string().min(1),
    options: z.array(z.object({
      text: z.string().min(1, tValidation("answerOptionRequired")),
      isCorrect: z.boolean(),
      sortOrder: z.number().int().min(0),
    })).min(2, tValidation("minTwoOptions")),
  });
}

interface OptionInput {
  id?: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
}

interface AssessmentQuestionFormProps {
  assessmentId: string;
  question?: {
    id: string;
    text: string;
    type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
    points: number;
    sortOrder: number;
    options: OptionInput[];
  };
}

export function AssessmentQuestionForm({ assessmentId, question }: AssessmentQuestionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const t = useTranslations("assessments");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tValidation = useTranslations("validation");

  const [text, setText] = useState(question?.text || "");
  const [type, setType] = useState<"SINGLE_CHOICE" | "MULTIPLE_CHOICE">(
    question?.type || "SINGLE_CHOICE"
  );
  const [points, setPoints] = useState(question?.points ?? 1);
  const [options, setOptions] = useState<OptionInput[]>(
    question?.options || [
      { text: "", isCorrect: false, sortOrder: 0 },
      { text: "", isCorrect: false, sortOrder: 1 },
    ]
  );

  const resetForm = () => {
    if (!question) {
      setText("");
      setType("SINGLE_CHOICE");
      setPoints(1);
      setOptions([
        { text: "", isCorrect: false, sortOrder: 0 },
        { text: "", isCorrect: false, sortOrder: 1 },
      ]);
    } else {
      setText(question.text);
      setType(question.type);
      setPoints(question.points);
      setOptions(question.options);
    }
  };

  const addOption = () => {
    setOptions([
      ...options,
      { text: "", isCorrect: false, sortOrder: options.length },
    ]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) {
      toast({
        title: tErrors("error"),
        description: t("minTwoOptions"),
        variant: "destructive",
      });
      return;
    }
    setOptions(options.filter((_, i) => i !== index).map((o, i) => ({ ...o, sortOrder: i })));
  };

  const updateOptionText = (index: number, value: string) => {
    setOptions(options.map((o, i) => (i === index ? { ...o, text: value } : o)));
  };

  const toggleOptionCorrect = (index: number) => {
    if (type === "SINGLE_CHOICE") {
      setOptions(
        options.map((o, i) => ({
          ...o,
          isCorrect: i === index,
        }))
      );
    } else {
      setOptions(
        options.map((o, i) =>
          i === index ? { ...o, isCorrect: !o.isCorrect } : o
        )
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const formattedOptions = options.map((o, i) => ({
      text: o.text.trim(),
      isCorrect: o.isCorrect,
      sortOrder: i,
    }));

    const clientQuestionSchema = createQuestionSchema(tValidation);
    const validationResult = clientQuestionSchema.safeParse({
      text: text.trim(),
      type,
      points,
      sortOrder: question?.sortOrder ?? 0,
      assessmentId,
      options: formattedOptions,
    });

    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      toast({
        title: tErrors("error"),
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    if (!options.some((o) => o.isCorrect)) {
      toast({
        title: tErrors("error"),
        description: t("markCorrectAnswer"),
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        if (question) {
          const result = await updateAssessmentQuestion(question.id, {
            text: text.trim(),
            type,
            points,
            sortOrder: question.sortOrder,
            options: formattedOptions,
          });

          if (result.success) {
            toast({ title: tCommon("save"), description: t("questionUpdated") });
            setOpen(false);
            router.refresh();
          } else {
            toast({
              title: tErrors("error"),
              description: result.error || t("questionUpdateFailed"),
              variant: "destructive",
            });
          }
        } else {
          const result = await addAssessmentQuestion({
            text: text.trim(),
            type,
            points,
            sortOrder: 0,
            assessmentId,
            options: formattedOptions,
          });

          if (result.success) {
            toast({ title: tCommon("save"), description: t("questionAdded") });
            resetForm();
            setOpen(false);
            router.refresh();
          } else {
            toast({
              title: tErrors("error"),
              description: result.error || t("questionAddFailed"),
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {question ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("addQuestion")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {question ? t("editQuestion") : t("addQuestion")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aq-text">{t("questionText")}</Label>
            <Textarea
              id="aq-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("questionTextPlaceholder")}
              rows={3}
              disabled={isPending}
            />
          </div>

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>{t("questionType")}</Label>
              <Select
                value={type}
                onValueChange={(value: "SINGLE_CHOICE" | "MULTIPLE_CHOICE") => {
                  setType(value);
                  if (value === "SINGLE_CHOICE") {
                    const firstCorrectIdx = options.findIndex((o) => o.isCorrect);
                    setOptions(
                      options.map((o, i) => ({
                        ...o,
                        isCorrect: i === (firstCorrectIdx >= 0 ? firstCorrectIdx : 0),
                      }))
                    );
                  }
                }}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE_CHOICE">{t("singleChoice")}</SelectItem>
                  <SelectItem value="MULTIPLE_CHOICE">{t("multipleChoice")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aq-points">{tCommon("points")}</Label>
              <Input
                id="aq-points"
                type="number"
                min={1}
                value={points}
                onChange={(e) => setPoints(parseInt(e.target.value) || 1)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("answerOptions")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                disabled={isPending}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t("addOption")}
              </Button>
            </div>

            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex items-center">
                  <Checkbox
                    checked={option.isCorrect}
                    onCheckedChange={() => toggleOptionCorrect(index)}
                    disabled={isPending}
                    className="mr-2"
                  />
                </div>
                <Input
                  value={option.text}
                  onChange={(e) => updateOptionText(index, e.target.value)}
                  placeholder={t("optionPlaceholder", { number: index + 1 })}
                  disabled={isPending}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(index)}
                  disabled={isPending || options.length <= 2}
                  className="flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              {t("markCorrectHint")}
              {type === "SINGLE_CHOICE"
                ? ` ${t("singleCorrectHint")}`
                : ` ${t("multipleCorrectHint")}`}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {question ? tCommon("save") : tCommon("add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
