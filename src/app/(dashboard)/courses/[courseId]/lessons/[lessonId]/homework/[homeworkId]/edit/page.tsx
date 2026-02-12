import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHomeworkForTeacher } from "@/actions/homework-actions";
import { HomeworkForm } from "@/components/homework/homework-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface EditHomeworkPageProps {
  params: Promise<{ courseId: string; lessonId: string; homeworkId: string }>;
}

export default async function EditHomeworkPage({ params }: EditHomeworkPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseId, lessonId, homeworkId } = await params;
  const result = await getHomeworkForTeacher(homeworkId);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Задание не найдено</h1>
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  const homework = result.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/courses/${courseId}/lessons/${lessonId}/edit`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Назад
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Редактировать задание</h1>
      </div>

      <HomeworkForm
        courseId={courseId}
        lessonId={lessonId}
        homework={JSON.parse(JSON.stringify(homework))}
      />
    </div>
  );
}
