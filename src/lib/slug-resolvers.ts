import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export async function resolveCourseSlug(courseSlug: string): Promise<string> {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug, deletedAt: null },
    select: { id: true },
  });
  if (!course) notFound();
  return course.id;
}

export async function resolveLessonSlug(
  courseId: string,
  lessonSlug: string
): Promise<string> {
  const lesson = await prisma.lesson.findUnique({
    where: { courseId_slug: { courseId, slug: lessonSlug } },
    select: { id: true },
  });
  if (!lesson) notFound();
  return lesson.id;
}

export async function resolveHomeworkSlug(
  lessonId: string,
  homeworkSlug: string
): Promise<string> {
  const homework = await prisma.homework.findUnique({
    where: { lessonId_slug: { lessonId, slug: homeworkSlug } },
    select: { id: true },
  });
  if (!homework) notFound();
  return homework.id;
}

export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug: string;
  homeworkSlug: string;
}): Promise<{ courseId: string; lessonId: string; homeworkId: string }>;
export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug: string;
  homeworkSlug?: undefined;
}): Promise<{ courseId: string; lessonId: string }>;
export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug?: undefined;
  homeworkSlug?: undefined;
}): Promise<{ courseId: string }>;
export async function resolveFullPath(params: {
  courseSlug: string;
  lessonSlug?: string;
  homeworkSlug?: string;
}): Promise<{
  courseId: string;
  lessonId?: string;
  homeworkId?: string;
}> {
  if (params.homeworkSlug && params.lessonSlug) {
    const homework = await prisma.homework.findFirst({
      where: {
        slug: params.homeworkSlug,
        lesson: {
          slug: params.lessonSlug,
          course: { slug: params.courseSlug },
        },
      },
      select: {
        id: true,
        lessonId: true,
        lesson: { select: { courseId: true } },
      },
    });
    if (!homework) notFound();
    return {
      courseId: homework.lesson.courseId,
      lessonId: homework.lessonId,
      homeworkId: homework.id,
    };
  }

  if (params.lessonSlug) {
    const lesson = await prisma.lesson.findFirst({
      where: {
        slug: params.lessonSlug,
        course: { slug: params.courseSlug },
      },
      select: { id: true, courseId: true },
    });
    if (!lesson) notFound();
    return { courseId: lesson.courseId, lessonId: lesson.id };
  }

  const courseId = await resolveCourseSlug(params.courseSlug);
  return { courseId };
}
