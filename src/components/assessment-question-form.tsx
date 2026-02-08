"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { addAssessmentQuestion, updateAssessmentQuestion } from "@/actions/assessment-actions";
import { z } from "zod";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

const clientQuestionSchema = z.object({
  text: z.string().min(1, "Текст вопроса обязателен"),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE"]),
  points: z.number().int("Баллы должны быть целым числом").min(1, "Минимум 1 балл"),
  sortOrder: z.number().int().min(0),
  assessmentId: z.string().min(1, "ID мероприятия обязателен"),
  options: z.array(z.object({
    text: z.string().min(1, "Текст варианта ответа обязателен"),
    isCorrect: z.boolean(),
    sortOrder: z.number().int().min(0),
  })).min(2, "Минимум 2 варианта ответа"),
});

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
        title: "Ошибка",
        description: "Минимум 2 варианта ответа",
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
        title: "Ошибка",
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    if (!options.some((o) => o.isCorrect)) {
      toast({
        title: "Ошибка",
        description: "Отметьте хотя бы один правильный ответ",
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
            toast({ title: "Успешно", description: "Вопрос обновлен" });
            setOpen(false);
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error || "Не удалось обновить вопрос",
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
            toast({ title: "Успешно", description: "Вопрос добавлен" });
            resetForm();
            setOpen(false);
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error || "Не удалось добавить вопрос",
              variant: "destructive",
            });
          }
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
            Добавить вопрос
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {question ? "Редактировать вопрос" : "Добавить вопрос"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aq-text">Текст вопроса</Label>
            <Textarea
              id="aq-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст вопроса..."
              rows={3}
              disabled={isPending}
            />
          </div>

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>Тип вопроса</Label>
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
                  <SelectItem value="SINGLE_CHOICE">Один ответ</SelectItem>
                  <SelectItem value="MULTIPLE_CHOICE">Несколько ответов</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aq-points">Баллы</Label>
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
              <Label>Варианты ответа</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                disabled={isPending}
              >
                <Plus className="h-3 w-3 mr-1" />
                Добавить
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
                  placeholder={`Вариант ${index + 1}`}
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
              Отметьте правильные варианты ответа галочкой слева.
              {type === "SINGLE_CHOICE"
                ? " Для вопроса с одним ответом можно выбрать только один правильный вариант."
                : " Для вопроса с несколькими ответами можно выбрать несколько правильных вариантов."}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {question ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
