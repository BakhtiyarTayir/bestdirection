"use client";

import { useState } from "react";
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
import { CheckCircle2, XCircle, RotateCcw, User, Code2, FileText, TestTube } from "lucide-react";
import { reviewSubmission } from "@/actions/homework-review-actions";
import { CodeRunnerPanel } from "./code-runner-panel";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";

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
              <div className="rounded-md border bg-muted/30 p-4 overflow-auto max-h-[600px]">
                <pre className="text-sm font-mono whitespace-pre-wrap">{submission.code}</pre>
              </div>
            </TabsContent>
          )}

          {hasFiles && (
            <TabsContent value="files" className="mt-4">
              <div className="space-y-2">
                {submission.files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{file.filename}</span>
                      <span className="text-xs text-muted-foreground">
                        ({Math.round(file.size / 1024)} KB)
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <a href={`/api/files/${file.id}`} target="_blank" rel="noopener">
                        <Button size="sm" variant="outline">{t("review.check")}</Button>
                      </a>
                      <a href={`/api/files/${file.id}/download`}>
                        <Button size="sm" variant="ghost">↓</Button>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
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
        {hw.type === "CODE" && hw.language && (
          <CodeRunnerPanel submissionId={submission.id} language={hw.language} />
        )}
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
