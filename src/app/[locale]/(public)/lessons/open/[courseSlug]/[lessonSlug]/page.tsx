import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Code2 } from "lucide-react";

interface PublicLessonPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}

export default async function PublicLessonPage({ params }: PublicLessonPageProps) {
  const tLessons = await getTranslations("lessons");
  const tHomework = await getTranslations("homework");
  const tAuth = await getTranslations("auth");
  const { courseSlug, lessonSlug } = await params;

  const lesson = await prisma.lesson.findFirst({
    where: {
      slug: lessonSlug,
      isPublished: true,
      course: {
        slug: courseSlug,
        isPublished: true,
      },
    },
    select: {
      title: true,
      content: true,
      homeworks: {
        where: { isPublished: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          language: true,
        },
      },
    },
  });

  if (!lesson) notFound();

  const callbackPath = `/courses/${courseSlug}/lessons/${lessonSlug}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
        <Button asChild>
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}>
            {tAuth("login")}
          </Link>
        </Button>
      </div>

      {lesson.content ? (
        <div className="rounded-lg border p-6 bg-card">
          <MarkdownRenderer content={lesson.content} />
        </div>
      ) : (
        <div className="rounded-lg border p-6 text-muted-foreground">
          {tLessons("noContent")}
        </div>
      )}

      {lesson.homeworks.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">{tLessons("homeworkTab")}</h2>
          {lesson.homeworks.map((hw) => (
            <div key={hw.id} className="rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-semibold">{hw.title}</h2>
                {hw.language && (
                  <Badge variant="outline" className="text-xs">
                    <Code2 className="h-3 w-3 mr-1" />
                    {LANGUAGE_LABELS[hw.language] || hw.language}
                  </Badge>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/${hw.slug}`}>
                  {tLessons("doHomework")}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        {tHomework("loginRequiredToSubmit")}
      </div>
      </div>
    </div>
  );
}
