import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { AssessmentForm } from "@/components/assessment-form";
import { useTranslations } from "next-intl";

interface NewExamPageProps {
  params: Promise<{ courseId: string }>;
}

export default function NewExamPage(props: NewExamPageProps) {
  const t = useTranslations("assessments");
  return <NewExamPageAsync params={props.params} t={t} />;
}

async function NewExamPageAsync({
  params,
  t,
}: {
  params: Promise<{ courseId: string }>;
  t: ReturnType<typeof useTranslations<"assessments">>;
}) {
  const { courseId } = await params;

  const session = await requireRole(["ADMIN", "TEACHER"]);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, teacherId: true },
  });

  if (!course) redirect("/courses");

  // Teachers can only create exams for their own courses
  if (
    session.user.role === "TEACHER" &&
    course.teacherId !== session.user.id
  ) {
    redirect(`/courses/${courseId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{course.title}</p>
        <h1 className="text-3xl font-bold mt-1">{t("createExam")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {t("examSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentForm type="EXAM" courseId={courseId} />
        </CardContent>
      </Card>
    </div>
  );
}
