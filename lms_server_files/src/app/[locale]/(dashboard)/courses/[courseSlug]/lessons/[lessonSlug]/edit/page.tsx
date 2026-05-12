import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLessonById } from "@/actions/lesson-actions";
import { prisma } from "@/lib/prisma";
import { EditLessonClient } from "./edit-lesson-client";
import { getTranslations } from "next-intl/server";
import { resolveFullPath } from "@/lib/slug-resolvers";

export const dynamic = "force-dynamic";

interface EditLessonPageProps {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}

export default async function EditLessonPage({ params }: EditLessonPageProps) {
  const tErrors = await getTranslations("errors");
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const { courseSlug, lessonSlug } = await params;
  const { courseId, lessonId } = await resolveFullPath({ courseSlug, lessonSlug });
  const result = await getLessonById(lessonId);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{tErrors("lessonNotFound")}</h1>
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
        courseSlug={courseSlug}
        lessonSlug={lessonSlug}
        lesson={lesson}
        assessment={assessment}
        homeworks={JSON.parse(JSON.stringify(homeworks))}
      />
    </div>
  );
}
