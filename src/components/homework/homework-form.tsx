"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { createHomework, updateHomework } from "@/actions/homework-actions";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import type { ProgrammingLanguage } from "@/validators/homework";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface TestCaseData {
  input: string;
  expected: string;
  isHidden: boolean;
  points: number;
  description: string;
}

interface HomeworkFormProps {
  courseId: string;
  lessonId: string;
  homework?: {
    id: string;
    title: string;
    description: string;
    language: string | null;
    starterCode: string | null;
    solutionCode: string | null;
    maxAttempts: number;
    timeLimitSec: number;
    passingScore: number;
    dueDate: string | null;
    allowLate: boolean;
    latePenalty: number;
    isPublished: boolean;
    testCases: {
      input: string;
      expected: string;
      isHidden: boolean;
      points: number;
      description: string | null;
    }[];
  };
}

export function HomeworkForm({ courseId, lessonId, homework }: HomeworkFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(homework?.title || "");
  const [description, setDescription] = useState(homework?.description || "");
  const [language, setLanguage] = useState<string>(homework?.language || "PYTHON");
  const [starterCode, setStarterCode] = useState(homework?.starterCode || "");
  const [solutionCode, setSolutionCode] = useState(homework?.solutionCode || "");
  const [maxAttempts, setMaxAttempts] = useState(homework?.maxAttempts ?? 10);
  const [timeLimitSec, setTimeLimitSec] = useState(homework?.timeLimitSec ?? 5);
  const [passingScore, setPassingScore] = useState(homework?.passingScore ?? 60);
  const [allowLate, setAllowLate] = useState(homework?.allowLate ?? true);
  const [latePenalty, setLatePenalty] = useState(homework?.latePenalty ?? 20);

  const [testCases, setTestCases] = useState<TestCaseData[]>(
    homework?.testCases?.map((tc) => ({
      input: tc.input,
      expected: tc.expected,
      isHidden: tc.isHidden,
      points: tc.points,
      description: tc.description || "",
    })) || [{ input: "", expected: "", isHidden: false, points: 1, description: "" }]
  );

  const addTestCase = () => {
    setTestCases([
      ...testCases,
      { input: "", expected: "", isHidden: false, points: 1, description: "" },
    ]);
  };

  const removeTestCase = (index: number) => {
    if (testCases.length <= 1) return;
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const updateTestCase = (index: number, field: keyof TestCaseData, value: string | boolean | number) => {
    setTestCases(
      testCases.map((tc, i) => (i === index ? { ...tc, [field]: value } : tc))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({ title: "Ошибка", description: "Введите название задания", variant: "destructive" });
      return;
    }
    if (!description.trim()) {
      toast({ title: "Ошибка", description: "Введите описание задания", variant: "destructive" });
      return;
    }
    if (testCases.some((tc) => !tc.expected.trim())) {
      toast({ title: "Ошибка", description: "Заполните ожидаемый результат для всех тест-кейсов", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      try {
        const testCasesData = testCases.map((tc) => ({
          input: tc.input,
          expected: tc.expected,
          isHidden: tc.isHidden,
          points: tc.points,
          description: tc.description || undefined,
        }));

        if (homework) {
          const result = await updateHomework(homework.id, {
            title: title.trim(),
            description: description.trim(),
            language: language as ProgrammingLanguage,
            starterCode: starterCode || undefined,
            solutionCode: solutionCode || undefined,
            maxAttempts,
            timeLimitSec,
            passingScore,
            allowLate,
            latePenalty,
            testCases: testCasesData,
          });

          if (result.success) {
            toast({ title: "Успешно", description: "Задание обновлено" });
            router.refresh();
          } else {
            toast({ title: "Ошибка", description: result.error, variant: "destructive" });
          }
        } else {
          const result = await createHomework(lessonId, {
            title: title.trim(),
            description: description.trim(),
            language: language as ProgrammingLanguage,
            starterCode: starterCode || undefined,
            solutionCode: solutionCode || undefined,
            maxAttempts,
            timeLimitSec,
            passingScore,
            allowLate,
            latePenalty,
            testCases: testCasesData,
          });

          if (result.success) {
            toast({ title: "Успешно", description: "Задание создано" });
            router.push(`/courses/${courseId}/lessons/${lessonId}/edit`);
            router.refresh();
          } else {
            toast({ title: "Ошибка", description: result.error, variant: "destructive" });
          }
        }
      } catch {
        toast({ title: "Ошибка", description: "Произошла непредвиденная ошибка", variant: "destructive" });
      }
    });
  };

  const monacoLanguage = LANGUAGE_LABELS[language] ? language.toLowerCase() : "python";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="hw-title">Название задания</Label>
          <Input
            id="hw-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Функция суммирования"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hw-description">Описание задания</Label>
          <Textarea
            id="hw-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опишите что нужно реализовать..."
            rows={4}
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Язык программирования</Label>
            <Select value={language} onValueChange={setLanguage} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hw-maxAttempts">Макс. попыток</Label>
            <Input
              id="hw-maxAttempts"
              type="number"
              min={1}
              max={100}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hw-timeLimitSec">Таймаут (сек)</Label>
            <Input
              id="hw-timeLimitSec"
              type="number"
              min={1}
              max={60}
              value={timeLimitSec}
              onChange={(e) => setTimeLimitSec(parseInt(e.target.value) || 5)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hw-passingScore">Проходной балл (%)</Label>
            <Input
              id="hw-passingScore"
              type="number"
              min={0}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(parseInt(e.target.value) || 0)}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center space-x-3">
            <Switch
              id="hw-allowLate"
              checked={allowLate}
              onCheckedChange={setAllowLate}
              disabled={isPending}
            />
            <Label htmlFor="hw-allowLate">Разрешить опоздание</Label>
          </div>
          {allowLate && (
            <div className="flex items-center gap-2">
              <Label htmlFor="hw-latePenalty" className="text-sm whitespace-nowrap">
                Штраф (%)
              </Label>
              <Input
                id="hw-latePenalty"
                type="number"
                min={0}
                max={100}
                value={latePenalty}
                onChange={(e) => setLatePenalty(parseInt(e.target.value) || 0)}
                className="w-20"
                disabled={isPending}
              />
            </div>
          )}
        </div>
      </div>

      {/* Starter Code */}
      <div className="space-y-2">
        <Label>Начальный код (шаблон для студента)</Label>
        <div className="border rounded-lg overflow-hidden">
          <Editor
            height="200px"
            language={monacoLanguage}
            value={starterCode}
            onChange={(value) => setStarterCode(value || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>
      </div>

      {/* Solution Code */}
      <div className="space-y-2">
        <Label>Эталонное решение (не видно студентам)</Label>
        <div className="border rounded-lg overflow-hidden">
          <Editor
            height="200px"
            language={monacoLanguage}
            value={solutionCode}
            onChange={(value) => setSolutionCode(value || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>
      </div>

      {/* Test Cases */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">Тест-кейсы ({testCases.length})</Label>
          <Button type="button" variant="outline" size="sm" onClick={addTestCase} disabled={isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить тест
          </Button>
        </div>

        {testCases.map((tc, index) => (
          <div key={index} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Тест {index + 1}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateTestCase(index, "isHidden", !tc.isHidden)}
                  title={tc.isHidden ? "Скрытый тест" : "Открытый тест"}
                >
                  {tc.isHidden ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTestCase(index)}
                  disabled={testCases.length <= 1}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Описание теста (необязательно)"
                value={tc.description}
                onChange={(e) => updateTestCase(index, "description", e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Входные данные</Label>
                <Textarea
                  value={tc.input}
                  onChange={(e) => updateTestCase(index, "input", e.target.value)}
                  placeholder='Например: 2, 3'
                  rows={2}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Ожидаемый результат</Label>
                <Textarea
                  value={tc.expected}
                  onChange={(e) => updateTestCase(index, "expected", e.target.value)}
                  placeholder="Например: 5"
                  rows={2}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Баллы:</Label>
                <Input
                  type="number"
                  min={1}
                  value={tc.points}
                  onChange={(e) => updateTestCase(index, "points", parseInt(e.target.value) || 1)}
                  className="w-16 h-8"
                  disabled={isPending}
                />
              </div>
              {tc.isHidden && (
                <Badge variant="outline" className="text-xs">
                  <EyeOff className="h-3 w-3 mr-1" />
                  Скрытый
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {homework ? "Сохранить изменения" : "Создать задание"}
        </Button>
      </div>
    </form>
  );
}
