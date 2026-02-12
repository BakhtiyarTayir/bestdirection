import { requireAuth } from "@/lib/auth-guard";
import { getCourseById } from "@/actions/course-actions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Edit,
  BookOpen,
  Users,
  ClipboardCheck,
  FileText,
  Video,
  GraduationCap,
  CheckCircle2,
  Copy,
  UsersRound,
} from "lucide-react";
import { CourseProgress } from "@/components/course-progress";
import { useTranslations } from "next-intl";

interface CourseDetailPageProps {
  params: Promise<{ courseId: string }>;
}

export default function CourseDetailPage(props: CourseDetailPageProps) {
  const t = useTranslations("courses");
  const tCommon = useTranslations("common");
  const tGroups = useTranslations("groups");
  const tAttendance = useTranslations("attendance");
  const tAssessments = useTranslations("assessments");
  return (
    <CourseDetailPageAsync
      params={props.params}
      t={t}
      tCommon={tCommon}
      tGroups={tGroups}
      tAttendance={tAttendance}
      tAssessments={tAssessments}
    />
  );
}

async function CourseDetailPageAsync({
  params,
  t,
  tCommon,
  tGroups,
  tAttendance,
  tAssessments,
}: {
  params: Promise<{ courseId: string }>;
  t: ReturnType<typeof useTranslations<"courses">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
  tGroups: ReturnType<typeof useTranslations<"groups">>;
  tAttendance: ReturnType<typeof useTranslations<"attendance">>;
  tAssessments: ReturnType<typeof useTranslations<"assessments">>;
}) {
  const { courseId } = await params;
  const session = await requireAuth();
  const role = session.user.role;

  const result = await getCourseById(courseId);
  if (!result.success || !result.data) {
    notFound();
  }

  const course = result.data;
  const isOwnerOrAdmin = role === "ADMIN" || (role === "TEACHER" && course.teacherId === session.user.id);

  // Fetch lessons for this course
  const lessons = await prisma.lesson.findMany({
    where: { courseId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      videoUrl: true,
      isPublished: true,
      sortOrder: true,
    },
  });

  // Fetch enrolled count
  const enrolledCount = await prisma.enrollment.count({
    where: { courseId },
  });

  // Fetch exams count
  const examsCount = await prisma.assessment.count({
    where: {
      courseId,
      type: "EXAM",
      ...(role === "STUDENT" ? { isPublished: true } : {}),
    },
  });

  // Fetch progress for students
  let courseProgress = { total: 0, completed: 0, percentage: 0 };
  const completedLessonIds = new Set<string>();
  if (role === "STUDENT") {
    const publishedLessons = lessons.filter((l) => l.isPublished);
    if (publishedLessons.length > 0) {
      const progressRecords = await prisma.lessonProgress.findMany({
        where: {
          studentId: session.user.id,
          lessonId: { in: publishedLessons.map((l) => l.id) },
          completedAt: { not: null },
        },
        select: { lessonId: true },
      });
      for (const p of progressRecords) {
        completedLessonIds.add(p.lessonId);
      }
      courseProgress = {
        total: publishedLessons.length,
        completed: completedLessonIds.size,
        percentage: Math.round((completedLessonIds.size / publishedLessons.length) * 100),
      };
    }
  }

  return (
    <div>
      {course.coverImage && (
        <div className="relative aspect-[3/1] mb-6 rounded-lg overflow-hidden">
          <Image
            src={course.coverImage}
            alt={course.title}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 800px"
            priority
          />
        </div>
      )}

      {/* Course header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{course.title}</h1>
            {course.isPublished ? (
              <Badge>{tCommon("published")}</Badge>
            ) : (
              <Badge variant="secondary">{tCommon("draft")}</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {t("teacherLabel")}: {course.teacher.firstName} {course.teacher.lastName}
          </p>
          {course.copiedFrom && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Copy className="h-3.5 w-3.5" />
              {t("copiedFrom")}{" "}
              <Link
                href={`/courses/${course.copiedFrom.id}`}
                className="text-primary hover:underline"
              >
                {course.copiedFrom.title}
              </Link>
              {course.copiedFrom.teacher && (
                <span>
                  ({course.copiedFrom.teacher.firstName} {course.copiedFrom.teacher.lastName})
                </span>
              )}
            </p>
          )}
          {course.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">
              {course.description}
            </p>
          )}
        </div>

        {isOwnerOrAdmin && (
          <div className="flex gap-2 shrink-0">
            <Link href={`/courses/${courseId}/edit`}>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                {tCommon("edit")}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("lessonsCount")}</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lessons.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("studentsCount")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enrolledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tCommon("status")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {course.isPublished ? tCommon("published") : tCommon("draft")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation links for admin/teacher */}
      {isOwnerOrAdmin && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Link href={`/courses/${courseId}/lessons`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{t("lessonsCount")}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("manageLessons")}
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/courses/${courseId}/exams`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <GraduationCap className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{tAssessments("exams")}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("manageExams")}
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/courses/${courseId}/students`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{t("studentsCount")}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("manageStudents")}
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/courses/${courseId}/groups`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <UsersRound className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{tGroups("title")}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("manageGroups")}
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`/courses/${courseId}/attendance`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">{tAttendance("title")}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("attendanceLog")}
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      )}

      {/* Course progress for students */}
      {role === "STUDENT" && courseProgress.total > 0 && (
        <div className="mb-8">
          <CourseProgress {...courseProgress} />
        </div>
      )}

      {/* Lesson list */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t("lessonsCount")}</h2>
        {lessons.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">
              {t("noLessons")}
            </p>
            {isOwnerOrAdmin && (
              <Link href={`/courses/${courseId}/lessons`}>
                <Button className="mt-4" variant="outline" size="sm">
                  {t("goToLessons")}
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson, index) => (
              <Link
                key={lesson.id}
                href={`/courses/${courseId}/lessons/${lesson.id}`}
              >
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader className="py-4 px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{lesson.title}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {lesson.videoUrl ? (
                              <><Video className="h-3 w-3" /> {t("videoAndNotes")}</>
                            ) : (
                              <><FileText className="h-3 w-3" /> {t("notesOnly")}</>
                            )}
                          </p>
                        </div>
                      </div>
                      {isOwnerOrAdmin && (
                        <>
                          {lesson.isPublished ? (
                            <Badge variant="default">{tCommon("published")}</Badge>
                          ) : (
                            <Badge variant="secondary">{tCommon("draft")}</Badge>
                          )}
                        </>
                      )}
                      {role === "STUDENT" && completedLessonIds.has(lesson.id) && (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Exams section */}
      {examsCount > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">{tAssessments("exams")}</h2>
          <Link href={`/courses/${courseId}/exams`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-3">
                <GraduationCap className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">
                    {examsCount}{" "}
                    {examsCount === 1
                      ? t("examsCountOne")
                      : examsCount < 5
                      ? t("examsCountFew")
                      : t("examsCountMany")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("goToExams")}
                  </p>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
