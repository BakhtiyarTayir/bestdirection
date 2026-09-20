import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getMyBestSubmissions } from "@/lib/api/homework.server";
import {
  getCourseLessonNav,
  getLessonById,
  getLessonProgress,
  getMyBestAttempt,
} from "@/lib/api/lessons.server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Edit,
  FileText,
  ClipboardList,
  Code2,
  Video,
  ArrowLeft,
  ArrowRight,
  Target,
  Clock,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { VideoPlayer } from "@/components/video-player";
import { MarkCompleteButton } from "@/components/mark-complete-button";
import { LessonContent } from "@/components/lesson-content";
import { LessonTOC } from "@/components/lesson-toc";
import { getTranslations } from "next-intl/server";
import { resolveFullPath } from "@/lib/slug-resolvers";
import { hasToc } from "@/lib/toc";
import { cn } from "@/lib/utils";

interface LessonPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}

type LessonHomework = {
  id: string;
  slug: string;
  title: string;
  language: string | null;
  isPublished: boolean;
  passingScore: number;
};

export default async function LessonPage({ params }: LessonPageProps) {
  const t = await getTranslations("lessons");
  const tCommon = await getTranslations("common");
  const tErrors = await getTranslations("errors");
  const tAssessments = await getTranslations("assessments");
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const { courseSlug, lessonSlug } = await params;
  const { lessonId } = await resolveFullPath({ courseSlug, lessonSlug });
  const result = await getLessonById(lessonId);

  if (!result.success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{tErrors("lessonNotFound")}</h1>
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  const lesson = result.data;
  const isTeacherOrAdmin =
    session.user.role === "ADMIN" || session.user.role === "TEACHER";
  const isStudent = session.user.role === "STUDENT";
  const homeworks = (lesson.homeworks ?? []) as LessonHomework[];

  // Sibling lessons for prev/next navigation and position label.
  // Черновики прячет api: видимость зависит от прав, а не от роли STUDENT.
  const navResult = await getCourseLessonNav(courseSlug);
  const siblings = navResult.success ? navResult.data.lessons : [];
  const currentIndex = siblings.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < siblings.length - 1
      ? siblings[currentIndex + 1]
      : null;

  // Fetch progress and results for students
  let initialPosition = 0;
  let isCompleted = false;
  let bestAttempt: { percentage: number; isPassed: boolean } | null = null;
  const bestSubmission = new Map<string, number>();

  if (isStudent) {
    const progressResult = await getLessonProgress(lessonId);
    if (progressResult.success && progressResult.data) {
      initialPosition = progressResult.data.lastPosition;
      isCompleted = !!progressResult.data.completedAt;
    }

    if (lesson.assessment) {
      const bestResult = await getMyBestAttempt(lesson.assessment.id);
      if (bestResult.success) bestAttempt = bestResult.data;
    }

    if (homeworks.length > 0) {
      const bestResults = await getMyBestSubmissions(lessonId);
      if (bestResults.success) {
        for (const row of bestResults.data) {
          bestSubmission.set(row.homeworkId, row.percentage);
        }
      }
    }
  }

  const hasVideo = !!(lesson.videoUrl && lesson.videoSource);
  const showToc = !!lesson.content && hasToc(lesson.content, lesson.contentFormat);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href={`/courses/${courseSlug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {lesson.course.title}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                {lesson.title}
              </h1>
              {!lesson.isPublished && (
                <Badge variant="secondary">{tCommon("draft")}</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              {currentIndex >= 0 && (
                <span>
                  {t("lessonPosition", {
                    index: currentIndex + 1,
                    total: siblings.length,
                  })}
                </span>
              )}
              {hasVideo && (
                <span className="inline-flex items-center gap-1.5">
                  <Video className="h-4 w-4" />
                  {t("videoLabel")}
                </span>
              )}
              {lesson.content && (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  {t("notesLabel")}
                </span>
              )}
              {lesson.assessment && (
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4" />
                  {tAssessments("test")}
                </span>
              )}
              {homeworks.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Code2 className="h-4 w-4" />
                  {t("homeworkCount", { count: homeworks.length })}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {isStudent && (
              <MarkCompleteButton lessonId={lessonId} isCompleted={isCompleted} />
            )}
            {isTeacherOrAdmin && (
              <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/edit`}>
                <Button variant="outline">
                  <Edit className="mr-2 h-4 w-4" />
                  {tCommon("edit")}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Content + sidebar */}
      <div
        className={cn(
          "grid gap-8",
          showToc && "lg:grid-cols-[minmax(0,1fr)_16rem]"
        )}
      >
        <div
          className={cn(
            "min-w-0 space-y-6",
            // HTML-урок вёрстан как самостоятельная страница, ему нужна вся ширина;
            // markdown в prose держим узким для читаемости.
            lesson.contentFormat === "HTML" ? "w-full" : "max-w-4xl"
          )}
        >
          {/* Video (if available) */}
          {hasVideo && (
            <div className="overflow-hidden rounded-xl border bg-black shadow-sm">
              <VideoPlayer
                url={lesson.videoUrl!}
                source={lesson.videoSource!}
                lessonId={isStudent ? lessonId : undefined}
                initialPosition={isStudent ? initialPosition : undefined}
              />
            </div>
          )}

          {/* Text content */}
          {lesson.content ? (
            <LessonContent
              content={lesson.content}
              format={lesson.contentFormat}
            />
          ) : (
            !hasVideo && (
              <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>{t("noContent")}</p>
              </div>
            )
          )}

          {/* Test */}
          {lesson.assessment ? (
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {tAssessments("test")}
              </h2>
              <Card>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">
                          {lesson.assessment.title}
                        </h3>
                        {!lesson.assessment.isPublished && (
                          <Badge variant="secondary">{tCommon("draft")}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Target className="h-4 w-4" />
                          {t("passingScoreShort", {
                            score: lesson.assessment.passingScore,
                          })}
                        </span>
                        {lesson.assessment.timeLimitMin && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            {t("timeLimitShort", {
                              minutes: lesson.assessment.timeLimitMin,
                            })}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <RotateCcw className="h-4 w-4" />
                          {t("attemptsShort", {
                            count: lesson.assessment.maxAttempts,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isStudent && bestAttempt && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {t("bestResult", {
                          percent: Math.round(bestAttempt.percentage),
                        })}
                      </span>
                      {bestAttempt.isPassed ? (
                        <Badge className="bg-green-600 hover:bg-green-600">
                          {t("passed")}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">{t("notPassed")}</Badge>
                      )}
                    </div>
                  )}

                  {isStudent && lesson.assessment.isPublished && (
                    <Link
                      href={`/courses/${courseSlug}/lessons/${lessonSlug}/test`}
                    >
                      <Button>{t("takeTest")}</Button>
                    </Link>
                  )}
                  {isStudent && !lesson.assessment.isPublished && (
                    <p className="text-sm text-muted-foreground">
                      {t("testNotAvailable")}
                    </p>
                  )}
                  {isTeacherOrAdmin && (
                    <Link
                      href={`/courses/${courseSlug}/lessons/${lessonSlug}/test`}
                    >
                      <Button variant="outline">{t("manageTest")}</Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : isTeacherOrAdmin ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <ClipboardList className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">{t("noTestAdded")}</p>
              <Link href={`/courses/${courseSlug}/lessons/${lessonSlug}/test`}>
                <Button>{tAssessments("createTest")}</Button>
              </Link>
            </div>
          ) : null}

          {/* Homework */}
          {homeworks.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("homeworkTab")}
              </h2>
              <div className="space-y-3">
                {homeworks.map((hw) => {
                  const best = bestSubmission.get(hw.id);
                  return (
                    <Card key={hw.id}>
                      <CardContent className="space-y-4 p-6">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            <Code2 className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold">
                                {hw.title}
                              </h3>
                              {hw.language && (
                                <Badge variant="outline" className="text-xs">
                                  {LANGUAGE_LABELS[hw.language] || hw.language}
                                </Badge>
                              )}
                              {!hw.isPublished && (
                                <Badge variant="secondary">
                                  {tCommon("draft")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <Target className="h-4 w-4" />
                                {t("passingScoreShort", {
                                  score: hw.passingScore,
                                })}
                              </span>
                              {isStudent && best !== undefined && (
                                <span className="inline-flex items-center gap-1.5">
                                  <CheckCircle2 className="h-4 w-4" />
                                  {t("bestResult", { percent: best })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isStudent && hw.isPublished && (
                          <Link
                            href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/${hw.slug}`}
                          >
                            <Button>{t("doHomework")}</Button>
                          </Link>
                        )}
                        {isStudent && !hw.isPublished && (
                          <p className="text-sm text-muted-foreground">
                            {t("homeworkNotAvailable")}
                          </p>
                        )}
                        {isTeacherOrAdmin && (
                          <Link
                            href={`/courses/${courseSlug}/lessons/${lessonSlug}/homework/${hw.slug}`}
                          >
                            <Button variant="outline">
                              {t("manageHomework")}
                            </Button>
                          </Link>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

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
                      {t("prevLesson")}
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
                      {t("nextLesson")}
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
            <LessonTOC content={lesson.content} format={lesson.contentFormat} />
          </aside>
        )}
      </div>
    </div>
  );
}
