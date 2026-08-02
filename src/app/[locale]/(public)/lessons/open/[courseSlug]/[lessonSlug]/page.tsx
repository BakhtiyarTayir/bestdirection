import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { LessonTOC } from "@/components/lesson-toc";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Code2, FileText, Target, ArrowLeft, ArrowRight } from "lucide-react";
import { hasToc } from "@/lib/toc";
import { cn } from "@/lib/utils";

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
      id: true,
      title: true,
      content: true,
      courseId: true,
      course: { select: { title: true } },
      homeworks: {
        where: { isPublished: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          language: true,
          passingScore: true,
        },
      },
    },
  });

  if (!lesson) notFound();

  const siblings = await prisma.lesson.findMany({
    where: { courseId: lesson.courseId, isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, title: true },
  });
  const currentIndex = siblings.findIndex((l) => l.id === lesson.id);
  const prevLesson = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < siblings.length - 1
      ? siblings[currentIndex + 1]
      : null;

  const callbackPath = `/courses/${courseSlug}/lessons/${lessonSlug}`;
  const showToc = !!lesson.content && hasToc(lesson.content);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 md:px-6 md:py-10">
      {/* Header */}
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          {lesson.course.title}
        </span>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {lesson.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              {currentIndex >= 0 && (
                <span>
                  {tLessons("lessonPosition", {
                    index: currentIndex + 1,
                    total: siblings.length,
                  })}
                </span>
              )}
              {lesson.content && (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  {tLessons("notesLabel")}
                </span>
              )}
              {lesson.homeworks.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Code2 className="h-4 w-4" />
                  {tLessons("homeworkCount", { count: lesson.homeworks.length })}
                </span>
              )}
            </div>
          </div>

          <Button asChild className="shrink-0">
            <Link href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}>
              {tAuth("login")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Content + sidebar */}
      <div
        className={cn(
          "grid gap-8",
          showToc && "lg:grid-cols-[minmax(0,1fr)_16rem]"
        )}
      >
        <div className="min-w-0 max-w-4xl space-y-6">
          {lesson.content ? (
            <Card>
              <CardContent className="p-6 md:p-8">
                <MarkdownRenderer content={lesson.content} />
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
              <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>{tLessons("noContent")}</p>
            </div>
          )}

          {/* Homework */}
          {lesson.homeworks.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {tLessons("homeworkTab")}
              </h2>
              <div className="space-y-3">
                {lesson.homeworks.map((hw) => (
                  <Card key={hw.id}>
                    <CardContent className="space-y-4 p-6">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                          <Code2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold">{hw.title}</h3>
                            {hw.language && (
                              <Badge variant="outline" className="text-xs">
                                {LANGUAGE_LABELS[hw.language] || hw.language}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Target className="h-4 w-4" />
                              {tLessons("passingScoreShort", {
                                score: hw.passingScore,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Button asChild variant="outline">
                        <Link
                          href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/${hw.slug}`}
                        >
                          {tLessons("doHomework")}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            {tHomework("loginRequiredToSubmit")}
          </div>

          {/* Prev / next navigation */}
          {(prevLesson || nextLesson) && (
            <nav className="grid gap-3 border-t pt-6 sm:grid-cols-2">
              {prevLesson ? (
                <Link
                  href={`/courses/${courseSlug}/lessons/${prevLesson.slug}`}
                  className="group flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-accent"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {tLessons("prevLesson")}
                    </div>
                    <div className="truncate text-sm font-medium">
                      {prevLesson.title}
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="hidden sm:block" />
              )}

              {nextLesson && (
                <Link
                  href={`/courses/${courseSlug}/lessons/${nextLesson.slug}`}
                  className="group flex items-center justify-end gap-3 rounded-xl border p-4 text-right transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {tLessons("nextLesson")}
                    </div>
                    <div className="truncate text-sm font-medium">
                      {nextLesson.title}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              )}
            </nav>
          )}
        </div>

        {/* Table of Contents */}
        {showToc && (
          <aside className="hidden lg:block">
            <LessonTOC content={lesson.content} />
          </aside>
        )}
      </div>
    </div>
  );
}
