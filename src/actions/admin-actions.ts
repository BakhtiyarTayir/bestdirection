"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";
import { hardDeleteCourseRecord, hardDeleteLessonRecord } from "@/lib/trash";

// ============================================================
// Get deleted records
// ============================================================

// Пользователей в корзине нет: их не удаляют мягко, а деактивируют
// (deactivateUser снимает isActive и не ставит deletedAt). Восстановление и
// полное удаление — на вкладке «Деактивированные», см. user-actions.ts.
export async function getDeletedCourses() {
  return withAuth(
    async () => {
      const courses = await prisma.course.findMany({
        where: { deletedAt: { not: null } },
        include: {
          teacher: {
            select: { firstName: true, lastName: true },
          },
          _count: { select: { lessons: true, enrollments: true } },
        },
        orderBy: { deletedAt: "desc" },
      });
      return { success: true as const, data: courses };
    },
    { roles: ["ADMIN"] }
  );
}

export async function getDeletedLessons() {
  return withAuth(
    async () => {
      const lessons = await prisma.lesson.findMany({
        where: { deletedAt: { not: null } },
        include: {
          course: { select: { title: true } },
        },
        orderBy: { deletedAt: "desc" },
      });
      return { success: true as const, data: lessons };
    },
    { roles: ["ADMIN"] }
  );
}

// ============================================================
// Restore records
// ============================================================

export async function restoreCourse(courseId: string) {
  return withAuth(
    async (session) => {
      const course = await prisma.course.update({
        where: { id: courseId },
        data: { deletedAt: null },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Course",
        entityId: courseId,
        action: "UPDATE",
        metadata: { restored: true, title: course.title },
      });

      return { success: true as const, data: course };
    },
    { roles: ["ADMIN"] }
  );
}

export async function restoreLesson(lessonId: string) {
  return withAuth(
    async (session) => {
      const lesson = await prisma.lesson.update({
        where: { id: lessonId },
        data: { deletedAt: null },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Lesson",
        entityId: lessonId,
        action: "UPDATE",
        metadata: { restored: true, title: lesson.title },
      });

      return { success: true as const, data: lesson };
    },
    { roles: ["ADMIN"] }
  );
}

// ============================================================
// Hard delete (permanent removal)
// ============================================================

// Логика и её подводные камни — в src/lib/trash.ts. Здесь только права:
// оттуда её можно проверить на настоящей базе, а экшен за withAuth — нельзя.
export async function hardDeleteCourse(courseId: string) {
  return withAuth(
    async (session) => {
      const result = await hardDeleteCourseRecord(courseId, session.user.id);
      if (!result.ok) {
        return { success: false as const, error: result.error };
      }
      return { success: true as const, data: null };
    },
    { roles: ["ADMIN"] }
  );
}

export async function hardDeleteLesson(lessonId: string) {
  return withAuth(
    async (session) => {
      const result = await hardDeleteLessonRecord(lessonId, session.user.id);
      if (!result.ok) {
        return { success: false as const, error: result.error };
      }
      return { success: true as const, data: null };
    },
    { roles: ["ADMIN"] }
  );
}
