import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLessonById } from "@/actions/lesson-actions";
import { prisma } from "@/lib/prisma";
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
        <h1 className="text-2xl font-bold">Урок не найден</h1>
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  const lesson = result.data;

  const [assessment, homeworks] = await Promise.all([
    prisma.assessment.findUnique({
      where: { lessonId },
      include: {
        questions: {
          include: {
            options: {
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: { attempts: true },
        },
      },
    }),
    prisma.homework.findMany({
      where: { lessonId },
      include: {
        _count: { select: { testCases: true, submissions: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <EditLessonClient
        courseId={courseId}
        lesson={lesson}
        assessment={assessment}
        homeworks={JSON.parse(JSON.stringify(homeworks))}
      />
    </div>
  );
}
