"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";

// ---------- updateLessonProgress ----------
export async function updateLessonProgress(
  lessonId: string,
  data: { watchTime: number; lastPosition: number }
) {
  return withAuth(
    async (session) => {
      const progress = await prisma.lessonProgress.upsert({
        where: {
          studentId_lessonId: {
            studentId: session.user.id,
            lessonId,
          },
        },
        create: {
          studentId: session.user.id,
          lessonId,
          watchTime: data.watchTime,
          lastPosition: data.lastPosition,
        },
        update: {
          watchTime: data.watchTime,
          lastPosition: data.lastPosition,
        },
      });

      return { success: true, data: progress };
    },
    { roles: ["STUDENT"] }
  );
}

// ---------- markLessonComplete ----------
export async function markLessonComplete(lessonId: string) {
  return withAuth(
    async (session) => {
      const progress = await prisma.lessonProgress.upsert({
        where: {
          studentId_lessonId: {
            studentId: session.user.id,
            lessonId,
          },
        },
        create: {
          studentId: session.user.id,
          lessonId,
          completedAt: new Date(),
        },
        update: {
          completedAt: new Date(),
        },
      });

      return { success: true, data: progress };
    },
    { roles: ["STUDENT"] }
  );
}

// ---------- getCourseProgress ----------
export async function getCourseProgress(courseId: string) {
  return withAuth(async (session) => {
    const lessons = await prisma.lesson.findMany({
      where: {
        courseId,
        isPublished: true,
      },
      select: { id: true },
    });

    if (lessons.length === 0) {
      return { success: true, data: { total: 0, completed: 0, percentage: 0 } };
    }

    const completedCount = await prisma.lessonProgress.count({
      where: {
        studentId: session.user.id,
        lessonId: { in: lessons.map((l) => l.id) },
        completedAt: { not: null },
      },
    });

    return {
      success: true,
      data: {
        total: lessons.length,
        completed: completedCount,
        percentage: Math.round((completedCount / lessons.length) * 100),
      },
    };
  });
}

// ---------- getLessonProgress ----------
export async function getLessonProgress(lessonId: string) {
  return withAuth(async (session) => {
    const progress = await prisma.lessonProgress.findUnique({
      where: {
        studentId_lessonId: {
          studentId: session.user.id,
          lessonId,
        },
      },
    });

    return { success: true, data: progress };
  });
}
