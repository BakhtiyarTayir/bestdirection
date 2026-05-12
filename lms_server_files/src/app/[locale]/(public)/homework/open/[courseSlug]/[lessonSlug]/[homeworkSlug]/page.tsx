import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Code2, FileUp } from "lucide-react";

interface PublicHomeworkPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string; homeworkSlug: string }>;
}

export default async function PublicHomeworkPage({ params }: PublicHomeworkPageProps) {
  const t = await getTranslations("homework");
  const tAuth = await getTranslations("auth");
  const tAssessments = await getTranslations("assessments");
  const { courseSlug, lessonSlug, homeworkSlug } = await params;

  const homework = await prisma.homework.findFirst({
    where: {
      slug: homeworkSlug,
      isPublished: true,
      lesson: {
        slug: lessonSlug,
        isPublished: true,
        course: {
          slug: courseSlug,
          isPublished: true,
        },
      },
    },
    select: {
      title: true,
      description: true,
      type: true,
      language: true,
      passingScore: true,
      maxAttempts: true,
      timeLimitSec: true,
      testCases: {
        where: { isHidden: false },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          input: true,
          expected: true,
          description: true,
        },
      },
    },
  });

  if (!homework) notFound();

  const callbackPath = `/courses/${courseSlug}/lessons/${lessonSlug}/homework/${homeworkSlug}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{homework.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {homework.type === "FILE" ? (
              <Badge variant="outline">
                <FileUp className="h-3 w-3 mr-1" />
                {t("homeworkTypeFile")}
              </Badge>
            ) : homework.language ? (
              <Badge variant="outline">
                <Code2 className="h-3 w-3 mr-1" />
                {LANGUAGE_LABELS[homework.language] || homework.language}
              </Badge>
            ) : null}
            <span>{t("passingLabel")}: {homework.passingScore}%</span>
            <span>{t("attemptsLabel")}: {homework.maxAttempts}</span>
            {homework.type !== "FILE" && (
              <span>{t("timeoutLabel")}: {homework.timeLimitSec} {tAssessments("seconds")}</span>
            )}
          </div>
        </div>

        <Button asChild>
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}>
            {t("signInToSubmit")}
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <MarkdownRenderer content={homework.description} />
      </div>

      {homework.type !== "FILE" && homework.testCases.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("exampleTests")}</h2>
          {homework.testCases.map((tc, index) => (
            <div key={tc.id} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="font-medium text-sm">
                {t("testCaseLabel", { number: index + 1, description: tc.description || "" })}
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">{t("input")}</div>
                  <pre className="mt-1 rounded bg-muted p-2 text-xs whitespace-pre-wrap">{tc.input}</pre>
                </div>
                <div>
                  <div className="text-muted-foreground">{t("expectedOutput")}</div>
                  <pre className="mt-1 rounded bg-muted p-2 text-xs whitespace-pre-wrap">{tc.expected}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t("loginRequiredToSubmit")}
      </div>

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}>
            {tAuth("login")}
          </Link>
        </Button>
      </div>
      </div>
    </div>
  );
}
