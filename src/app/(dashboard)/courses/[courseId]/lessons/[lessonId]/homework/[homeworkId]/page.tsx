import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHomeworkForStudent, getHomeworkForTeacher, getSubmissions } from "@/actions/homework-actions";
import { HomeworkView } from "@/components/homework/homework-view";
import { HomeworkSubmissions } from "@/components/homework/homework-submissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import Link from "next/link";
import { ArrowLeft, Code2, Pencil } from "lucide-react";

interface HomeworkPageProps {
  params: Promise<{ courseId: string; lessonId: string; homeworkId: string }>;
}

export default async function HomeworkPage({ params }: HomeworkPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { courseId, lessonId, homeworkId } = await params;
  const isTeacherOrAdmin = session.user.role === "ADMIN" || session.user.role === "TEACHER";

  if (isTeacherOrAdmin) {
    const [hwResult, subResult] = await Promise.all([
      getHomeworkForTeacher(homeworkId),
      getSubmissions(homeworkId),
    ]);

    if (!hwResult.success || !hwResult.data) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Задание не найдено</h1>
          <p className="text-destructive">{hwResult.error}</p>
        </div>
      );
    }

    const homework = hwResult.data;
    const submissions = subResult.success ? subResult.data! : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/courses/${courseId}/lessons/${lessonId}/edit`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Назад
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">{homework.title}</h1>
            <Badge variant={homework.isPublished ? "default" : "secondary"}>
              {homework.isPublished ? "Опубликовано" : "Черновик"}
            </Badge>
            {homework.language && (
              <Badge variant="outline">
                <Code2 className="h-3 w-3 mr-1" />
                {LANGUAGE_LABELS[homework.language] || homework.language}
              </Badge>
            )}
          </div>
          <Link href={`/courses/${courseId}/lessons/${lessonId}/homework/${homeworkId}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-2" />
              Редактировать
            </Button>
          </Link>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{homework.description}</p>
        </div>

        <HomeworkSubmissions submissions={JSON.parse(JSON.stringify(submissions))} />
      </div>
    );
  }

  // Student view
  const result = await getHomeworkForStudent(homeworkId);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Задание не найдено</h1>
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  const { homework, submissions, attemptsUsed, attemptsRemaining } = result.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/courses/${courseId}/lessons/${lessonId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            К уроку
          </Button>
        </Link>
      </div>
      <HomeworkView
        homework={JSON.parse(JSON.stringify(homework))}
        submissions={JSON.parse(JSON.stringify(submissions))}
        attemptsUsed={attemptsUsed}
        attemptsRemaining={attemptsRemaining}
      />
    </div>
  );
}
