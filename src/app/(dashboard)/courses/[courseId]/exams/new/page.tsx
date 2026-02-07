import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { ExamSettingsForm } from "@/components/exam-settings-form";

interface NewExamPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function NewExamPage({ params }: NewExamPageProps) {
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
        <h1 className="text-3xl font-bold mt-1">Создать экзамен</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Настройки экзамена
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExamSettingsForm courseId={courseId} />
        </CardContent>
      </Card>
    </div>
  );
}
