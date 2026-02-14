"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, XCircle, RotateCcw, User, Code2, FileText, TestTube, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { reviewSubmission } from "@/actions/homework-review-actions";
import { CodeRunnerPanel } from "./code-runner-panel";
import { LANGUAGE_CONFIG, LANGUAGE_LABELS, detectLanguageFromExtension } from "@/lib/code-runner/config";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface TestResult {
  passed: boolean;
  actualOutput: string | null;
  errorOutput: string | null;
  testCase: {
    description: string | null;
    expected: string;
    input: string;
    isHidden: boolean;
  };
}

interface SubmissionFile {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

interface SubmissionData {
  id: string;
  code: string;
  status: string;
  score: number;
  maxScore: number;
  percentage: number;
  attemptNumber: number;
  createdAt: string;
  manualStatus: string | null;
  manualScore: number | null;
  teacherComment: string | null;
  student: { id: string; firstName: string; lastName: string; email: string };
  homework: {
    id: string;
    title: string;
    type: string;
    language: string | null;
    description: string;
    requiresManualReview: boolean;
    reviewInstructions: string | null;
    timeLimitSec: number;
    lesson: {
      slug: string;
      title: string;
      course: { slug: string; title: string; teacherId: string };
    };
    testCases: { id: string; description: string | null; isHidden: boolean }[];
  };
  testResults: TestResult[];
  files: SubmissionFile[];
  reviewedBy: { firstName: string; lastName: string } | null;
}

export function SubmissionReviewPage({ submission }: { submission: SubmissionData }) {
  const t = useTranslations("homeworkHub");
  const { toast } = useToast();
  const router = useRouter();
  const [comment, setComment] = useState(submission.teacherComment || "");
  const [score, setScore] = useState<string>(submission.manualScore?.toString() || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hw = submission.homework;
  const hasCode = hw.type === "CODE" && submission.code;
  const hasFiles = submission.files.length > 0;
  const hasTests = submission.testResults.length > 0;

  // Track edited code from FILE tab for running
  const [fileEditedCode, setFileEditedCode] = useState<string | undefined>(undefined);
  const firstRunnableFileIndex = submission.files.findIndex(
    (f) => detectLanguageFromExtension(f.filename) !== null
  );

  // If code is a file placeholder, fetch actual file content
  const isFilePlaceholder = submission.code?.startsWith("[Файл:");
  const [codeContent, setCodeContent] = useState(isFilePlaceholder ? "" : submission.code);

  useEffect(() => {
    if (isFilePlaceholder && submission.files.length > 0) {
      fetch(`/api/files/${submission.files[0].id}`)
        .then((res) => res.text())
        .then(setCodeContent)
        .catch(() => setCodeContent(submission.code));
    }
  }, [isFilePlaceholder, submission.files, submission.code]);

  async function handleReview(status: "APPROVED" | "REJECTED" | "REVISION") {
    setIsSubmitting(true);
    try {
      const result = await reviewSubmission(submission.id, {
        status,
        comment: comment || undefined,
        manualScore: score ? parseInt(score) : undefined,
      });
      if (result.success) {
        toast({
          title: t(`status.${status.toLowerCase()}`),
          description: `${submission.student.firstName} ${submission.student.lastName} — ${hw.title}`,
        });
        router.push("/homework/review");
        router.refresh();
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left column - code/files/tests */}
      <div className="lg:col-span-2 space-y-4">
        <Tabs defaultValue={hasCode ? "code" : hasFiles ? "files" : "tests"}>
          <TabsList>
            {hasCode && (
              <TabsTrigger value="code" className="gap-1.5">
                <Code2 className="h-3.5 w-3.5" />
                {t("type.CODE")}
              </TabsTrigger>
            )}
            {hasFiles && (
              <TabsTrigger value="files" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {t("type.FILE")} ({submission.files.length})
              </TabsTrigger>
            )}
            {hasTests && (
              <TabsTrigger value="tests" className="gap-1.5">
                <TestTube className="h-3.5 w-3.5" />
                {t("review.autoTests")}
              </TabsTrigger>
            )}
          </TabsList>

          {hasCode && (
            <TabsContent value="code" className="mt-4">
              <div className="rounded-md border overflow-hidden">
                <MonacoEditor
                  height="500px"
                  language={LANGUAGE_CONFIG[hw.language || ""]?.monacoLanguage || "plaintext"}
                  value={codeContent}
                  onChange={(value) => setCodeContent(value || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: "on",
                  }}
                />
              </div>
            </TabsContent>
          )}

          {hasFiles && (
            <TabsContent value="files" className="mt-4 space-y-4">
              {submission.files.map((file, index) => (
                <FilePreview
                  key={file.id}
                  file={file}
                  editable={!hasCode && index === firstRunnableFileIndex}
                  onContentChange={!hasCode && index === firstRunnableFileIndex ? setFileEditedCode : undefined}
                />
              ))}
            </TabsContent>
          )}

          {hasTests && (
            <TabsContent value="tests" className="mt-4">
              <div className="space-y-2">
                {submission.testResults.map((tr, i) => (
                  <div
                    key={i}
                    className={`rounded-md border p-3 ${tr.passed ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {tr.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="text-sm font-medium">
                        {tr.testCase.description || `Test #${i + 1}`}
                      </span>
                    </div>
                    {!tr.testCase.isHidden && (
                      <div className="text-xs text-muted-foreground space-y-0.5 ml-6">
                        <p>Input: {tr.testCase.input}</p>
                        <p>Expected: {tr.testCase.expected}</p>
                        {tr.actualOutput && <p>Got: {tr.actualOutput}</p>}
                        {tr.errorOutput && <p className="text-red-600">Error: {tr.errorOutput}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Code runner */}
        {(() => {
          const detectedLanguage =
            hw.language ||
            (submission.files[0] ? detectLanguageFromExtension(submission.files[0].filename) : null);
          const codeOverride = hasCode ? (codeContent || undefined) : fileEditedCode;
          return detectedLanguage ? (
            <CodeRunnerPanel submissionId={submission.id} language={detectedLanguage} codeOverride={codeOverride} />
          ) : null;
        })()}
      </div>

      {/* Right column - student info + review form */}
      <div className="space-y-4">
        {/* Student info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("review.student")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">
              {submission.student.firstName} {submission.student.lastName}
            </p>
            <p className="text-muted-foreground">{submission.student.email}</p>
            <div className="flex gap-2">
              <Badge variant="outline">{t("card.attempt")} #{submission.attemptNumber}</Badge>
              <Badge variant="outline">{new Date(submission.createdAt).toLocaleDateString()}</Badge>
            </div>
            {hw.language && (
              <Badge variant="secondary">{LANGUAGE_LABELS[hw.language] || hw.language}</Badge>
            )}
          </CardContent>
        </Card>

        {/* Homework info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{hw.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>{hw.lesson.course.title} / {hw.lesson.title}</p>
            {hasTests && (
              <p>
                {t("review.autoTests")}: {submission.testResults.filter((r) => r.passed).length}/{submission.testResults.length}
              </p>
            )}
            <p>{t("review.score")}: {submission.percentage.toFixed(0)}%</p>
          </CardContent>
        </Card>

        {/* Review instructions */}
        {hw.reviewInstructions && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("review.reviewInstructions")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {hw.reviewInstructions}
            </CardContent>
          </Card>
        )}

        {/* Review form */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>{t("review.score")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="0-100"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("review.comment")}</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("review.commentPlaceholder")}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => handleReview("APPROVED")}
                disabled={isSubmitting}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t("review.approve")}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleReview("REVISION")}
                disabled={isSubmitting}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("review.revise")}
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => handleReview("REJECTED")}
                disabled={isSubmitting}
              >
                <XCircle className="h-4 w-4 mr-2" />
                {t("review.reject")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const TEXT_EXTENSIONS: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "typescript",
  ".jsx": "javascript",
  ".tsx": "typescript",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".php": "php",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".html": "html",
  ".css": "css",
  ".json": "json",
  ".xml": "xml",
  ".sql": "sql",
  ".sh": "shell",
  ".txt": "plaintext",
  ".md": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
};

function getMonacoLanguage(filename: string): string | null {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return TEXT_EXTENSIONS[ext] || null;
}

function FilePreview({ file, editable, onContentChange }: { file: SubmissionFile; editable?: boolean; onContentChange?: (content: string) => void }) {
  const t = useTranslations("homeworkHub");
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const monacoLang = getMonacoLanguage(file.filename);
  const isPreviewable = monacoLang !== null && file.size < 512 * 1024;

  useEffect(() => {
    if (!isPreviewable) return;
    setLoading(true);
    fetch(`/api/files/${file.id}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.text();
      })
      .then(setContent)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [file.id, isPreviewable]);

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{file.filename}</span>
          <span className="text-xs text-muted-foreground">
            ({Math.round(file.size / 1024)} KB)
          </span>
        </div>
        <a href={`/api/files/${file.id}/download`}>
          <Button size="sm" variant="ghost">↓</Button>
        </a>
      </div>
      {isPreviewable && loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {isPreviewable && error && (
        <div className="p-4 text-sm text-muted-foreground text-center">
          {t("review.fileLoadError")}
        </div>
      )}
      {isPreviewable && content !== null && (
        <MonacoEditor
          height="500px"
          language={monacoLang}
          value={content}
          onChange={editable ? (value) => { setContent(value || ""); onContentChange?.(value || ""); } : undefined}
          theme="vs-dark"
          options={{
            readOnly: !editable,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
          }}
        />
      )}
      {!isPreviewable && (
        <div className="p-4 text-sm text-muted-foreground text-center">
          <a href={`/api/files/${file.id}`} target="_blank" rel="noopener">
            <Button size="sm" variant="outline">{t("review.check")}</Button>
          </a>
        </div>
      )}
    </div>
  );
}
