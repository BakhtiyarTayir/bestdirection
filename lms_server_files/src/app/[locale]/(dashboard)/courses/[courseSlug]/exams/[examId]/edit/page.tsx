import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { AssessmentForm } from "@/components/assessment-form";
import { useTranslations } from "next-intl";
import { resolveCourseSlug } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface EditExamPageProps {
  params: Promise<{ courseSlug: string; examId: string }>;
}

export default function EditExamPage(props: EditExamPageProps) {
  const t = useTranslations("assessments");
  return <EditExamPageAsync params={props.params} t={t} />;
}

async function EditExamPageAsync({
  params,
  t,
}: {
  params: Promise<{ courseSlug: string; examId: string }>;
  t: ReturnType<typeof useTranslations<"assessments">>;
}) {
  const { courseSlug, examId } = await params;
  const courseId = await resolveCourseSlug(courseSlug);

  const session = await requireRole(["ADMIN", "TEACHER"]);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, teacherId: true },
  });

  if (!course) redirect("/courses");

  if (
    session.user.role === "TEACHER" &&
    course.teacherId !== session.user.id
  ) {
    redirect(`/courses/${courseSlug}`);
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: examId },
  });

  if (!assessment || assessment.type !== "EXAM") redirect(`/courses/${courseSlug}/exams`);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {course.title} / {t("exams")}
        </p>
        <h1 className="text-3xl font-bold mt-1">{t("editExam")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {t("examSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentForm
            type="EXAM"
            courseId={courseId}
            courseSlug={courseSlug}
            assessment={{
              id: assessment.id,
              title: assessment.title,
              description: assessment.description,
              passingScore: assessment.passingScore,
              timeLimitMin: assessment.timeLimitMin,
              maxAttempts: assessment.maxAttempts,
              isPublished: assessment.isPublished,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
