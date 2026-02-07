import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { ExamSettingsForm } from "@/components/exam-settings-form";

interface EditExamPageProps {
  params: Promise<{ courseId: string; examId: string }>;
}

export default async function EditExamPage({ params }: EditExamPageProps) {
  const { courseId, examId } = await params;

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
    redirect(`/courses/${courseId}`);
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!exam) redirect(`/courses/${courseId}/exams`);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {course.title} / Экзамены
        </p>
        <h1 className="text-3xl font-bold mt-1">Редактировать экзамен</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Настройки экзамена
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExamSettingsForm
            exam={{
              id: exam.id,
              title: exam.title,
              description: exam.description,
              passingScore: exam.passingScore,
              timeLimitMin: exam.timeLimitMin,
              maxAttempts: exam.maxAttempts,
              isPublished: exam.isPublished,
            }}
            courseId={courseId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
