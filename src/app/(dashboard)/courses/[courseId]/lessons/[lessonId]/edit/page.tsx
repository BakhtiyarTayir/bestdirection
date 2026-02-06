import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLessonById } from "@/actions/lesson-actions";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { EditLessonClient } from "./edit-lesson-client";

interface EditLessonPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default async function EditLessonPage({ params }: EditLessonPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseId, lessonId } = await params;
  const result = await getLessonById(lessonId);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/courses/${courseId}/lessons`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Урок не найден</h1>
        </div>
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  const lesson = result.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/courses/${courseId}/lessons/${lessonId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Редактировать урок</h1>
      </div>

      <EditLessonClient courseId={courseId} lesson={lesson} />
    </div>
  );
}
