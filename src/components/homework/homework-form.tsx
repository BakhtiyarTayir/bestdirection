"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
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
import { useTranslations } from "next-intl";
import type { ProgrammingLanguage, HomeworkType } from "@/validators/homework";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface TestCaseData {
  input: string;
  expected: string;
  isHidden: boolean;
  points: number;
  description: string;
}

interface HomeworkFormProps {
  courseSlug: string;
  lessonSlug: string;
  lessonId: string;
  homework?: {
    id: string;
    title: string;
    description: string;
    type?: string;
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

export function HomeworkForm({ courseSlug, lessonSlug, lessonId, homework }: HomeworkFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("homework");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tSuccess = useTranslations("success");

  const [type, setType] = useState<"CODE" | "FILE">((homework?.type as "CODE" | "FILE") || "CODE");
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
  const [isPublished, setIsPublished] = useState(homework?.isPublished ?? false);

  const [testCases, setTestCases] = useState<TestCaseData[]>(
    homework?.testCases?.map((tc) => ({
      input: tc.input,
      expected: tc.expected,
      isHidden: tc.isHidden,
      points: tc.points,
      description: tc.description || "",
    })) || [{ input: "", expected: "", isHidden: false, points: 1, description: "" }]
  );

  const isCode = type === "CODE";

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
      toast({ title: tErrors("generic"), description: t("enterTitle"), variant: "destructive" });
      return;
    }
    if (!description.trim()) {
      toast({ title: tErrors("generic"), description: t("enterDescription"), variant: "destructive" });
      return;
    }
    if (isCode && testCases.some((tc) => !tc.expected.trim())) {
      toast({ title: tErrors("generic"), description: t("fillExpected"), variant: "destructive" });
      return;
    }

    startTransition(async () => {
      try {
        const baseData = {
          title: title.trim(),
          description: description.trim(),
          type: type as HomeworkType,
          maxAttempts,
          passingScore,
          allowLate,
          latePenalty,
          isPublished,
        };

        const codeData = isCode ? {
          language: language as ProgrammingLanguage,
          starterCode: starterCode || undefined,
          solutionCode: solutionCode || undefined,
          timeLimitSec,
          testCases: testCases.map((tc) => ({
            input: tc.input,
            expected: tc.expected,
            isHidden: tc.isHidden,
            points: tc.points,
            description: tc.description || undefined,
          })),
        } : {};

        if (homework) {
          const result = await updateHomework(homework.id, {
            ...baseData,
            ...codeData,
          });

          if (result.success) {
            toast({ title: tSuccess("success"), description: t("homeworkUpdated") });
            router.refresh();
          } else {
            toast({ title: tErrors("generic"), description: result.error, variant: "destructive" });
          }
        } else {
          const result = await createHomework(lessonId, {
            ...baseData,
            ...codeData,
          });

          if (result.success) {
            toast({ title: tSuccess("success"), description: t("homeworkCreated") });
            router.push(`/courses/${courseSlug}/lessons/${lessonSlug}/edit`);
            router.refresh();
          } else {
            toast({ title: tErrors("generic"), description: result.error, variant: "destructive" });
          }
        }
      } catch {
        toast({ title: tErrors("generic"), description: tErrors("unexpected"), variant: "destructive" });
      }
    });
  };

  const monacoLanguage = LANGUAGE_LABELS[language] ? language.toLowerCase() : "python";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="hw-title">{t("homeworkTitle")}</Label>
          <Input
            id="hw-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("homeworkTitlePlaceholder")}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hw-description">{t("homeworkDescription")}</Label>
          <Textarea
            id="hw-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("homeworkDescriptionPlaceholder")}
            rows={4}
            disabled={isPending}
          />
        </div>

        {/* Homework Type Selector */}
        <div className="space-y-2">
          <Label>{t("homeworkType")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as "CODE" | "FILE")} disabled={isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CODE">{t("homeworkTypeCode")}</SelectItem>
              <SelectItem value="FILE">{t("homeworkTypeFile")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isCode && (
            <div className="space-y-2">
              <Label>{t("language")}</Label>
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
          )}

          <div className="space-y-2">
            <Label htmlFor="hw-maxAttempts">{t("maxAttempts")}</Label>
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

          {isCode && (
            <div className="space-y-2">
              <Label htmlFor="hw-timeLimitSec">{t("timeout")}</Label>
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
          )}

          <div className="space-y-2">
            <Label htmlFor="hw-passingScore">{t("passingScore")}</Label>
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
            <Label htmlFor="hw-allowLate">{t("allowLate")}</Label>
          </div>
          {allowLate && (
            <div className="flex items-center gap-2">
              <Label htmlFor="hw-latePenalty" className="text-sm whitespace-nowrap">
                {t("latePenalty")}
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

      {/* CODE-specific fields */}
      {isCode && (
        <>
          {/* Starter Code */}
          <div className="space-y-2">
            <Label>{t("starterCode")}</Label>
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
            <Label>{t("solutionCode")}</Label>
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
              <Label className="text-base">{t("testCases", { count: testCases.length })}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addTestCase} disabled={isPending}>
                <Plus className="h-4 w-4 mr-1" />
                {t("addTest")}
              </Button>
            </div>

            {testCases.map((tc, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{t("testNumber", { number: index + 1 })}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateTestCase(index, "isHidden", !tc.isHidden)}
                      title={tc.isHidden ? t("hiddenTest") : t("visibleTest")}
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
                    placeholder={t("testDescription")}
                    value={tc.description}
                    onChange={(e) => updateTestCase(index, "description", e.target.value)}
                    disabled={isPending}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("inputData")}</Label>
                    <Textarea
                      value={tc.input}
                      onChange={(e) => updateTestCase(index, "input", e.target.value)}
                      placeholder={t("inputPlaceholder")}
                      rows={2}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("expectedResult")}</Label>
                    <Textarea
                      value={tc.expected}
                      onChange={(e) => updateTestCase(index, "expected", e.target.value)}
                      placeholder={t("expectedPlaceholder")}
                      rows={2}
                      disabled={isPending}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">{t("pointsLabel")}</Label>
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
                      {t("hidden")}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Switch
            id="hw-isPublished"
            checked={isPublished}
            onCheckedChange={setIsPublished}
            disabled={isPending}
          />
          <Label htmlFor="hw-isPublished">{tCommon("publish")}</Label>
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {homework ? tCommon("saveChanges") : t("createHomework")}
        </Button>
      </div>
    </form>
  );
}
