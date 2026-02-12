import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  Plus,
  FileText,
  Clock,
  Target,
  RotateCcw,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { ImportButton } from "@/components/export-import-buttons";
import { useTranslations } from "next-intl";

interface ExamsPageProps {
  params: Promise<{ courseId: string }>;
}

export default function ExamsPage(props: ExamsPageProps) {
  const t = useTranslations("assessments");
  const tCommon = useTranslations("common");
  return <ExamsPageAsync params={props.params} t={t} tCommon={tCommon} />;
}

async function ExamsPageAsync({
  params,
  t,
  tCommon,
}: {
  params: Promise<{ courseId: string }>;
  t: ReturnType<typeof useTranslations<"assessments">>;
  tCommon: ReturnType<typeof useTranslations<"common">>;
}) {
  const { courseId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const userId = session.user.id;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, teacherId: true },
  });

  if (!course) redirect("/courses");

  const isTeacherOrAdmin =
    role === "ADMIN" || (role === "TEACHER" && course.teacherId === userId);

  const exams = await prisma.assessment.findMany({
    where: {
      courseId,
      type: "EXAM",
      ...(role === "STUDENT" ? { isPublished: true } : {}),
    },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  // For students, check eligibility
  let eligible = false;
  let unpassedCount = 0;
  if (role === "STUDENT") {
    const lessonTests = await prisma.assessment.findMany({
      where: {
        courseId,
        type: "TEST",
        isPublished: true,
        lessonId: { not: null },
      },
      select: { id: true },
    });

    let allPassed = true;
    for (const test of lessonTests) {
      const passedAttempt = await prisma.assessmentAttempt.findFirst({
        where: {
          assessmentId: test.id,
          studentId: userId,
          isPassed: true,
        },
      });
      if (!passedAttempt) {
        allPassed = false;
        unpassedCount++;
      }
    }
    eligible = allPassed;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{course.title}</p>
          <h1 className="text-3xl font-bold mt-1">{t("exams")}</h1>
        </div>
        {isTeacherOrAdmin && (
          <div className="flex items-center gap-2">
            <ImportButton type="exam" targetId={courseId} />
            <Link href={`/courses/${courseId}/exams/new`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t("addExam")}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Eligibility notice for students */}
      {role === "STUDENT" && !eligible && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="font-medium text-orange-800 dark:text-orange-200">
                  {t("examsNotAvailable")}
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-300">
                  {t("remainingUnpassed", { count: unpassedCount })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {exams.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">
            {isTeacherOrAdmin
              ? t("noExamsTeacher")
              : t("noExamsStudent")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {exams.map((exam) => (
            <Link
              key={exam.id}
              href={`/courses/${courseId}/exams/${exam.id}`}
            >
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">{exam.title}</CardTitle>
                        {exam.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {exam.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTeacherOrAdmin && (
                        <Badge variant={exam.isPublished ? "default" : "secondary"}>
                          {exam.isPublished ? tCommon("published") : tCommon("draft")}
                        </Badge>
                      )}
                      {role === "STUDENT" && (
                        eligible ? (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t("available")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            <Lock className="h-3 w-3 mr-1" />
                            {t("blocked")}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {exam._count.questions}{" "}
                      {exam._count.questions === 1
                        ? t("questionOne")
                        : exam._count.questions < 5
                        ? t("questionFew")
                        : t("questionMany")}
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {exam.passingScore}%
                    </div>
                    {exam.timeLimitMin && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {exam.timeLimitMin} {t("minutesShort")}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <RotateCcw className="h-4 w-4" />
                      {exam.maxAttempts}{" "}
                      {exam.maxAttempts === 1
                        ? t("attemptOne")
                        : exam.maxAttempts < 5
                        ? t("attemptFew")
                        : t("attemptMany")}
                    </div>
                    {isTeacherOrAdmin && (
                      <span>
                        {t("studentAttemptsCount", { count: exam._count.attempts })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
