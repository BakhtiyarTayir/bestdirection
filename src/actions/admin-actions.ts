"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";

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
    async () => {
      const course = await prisma.course.update({
        where: { id: courseId },
        data: { deletedAt: null },
      });
      return { success: true as const, data: course };
    },
    { roles: ["ADMIN"] }
  );
}

export async function restoreLesson(lessonId: string) {
  return withAuth(
    async () => {
      const lesson = await prisma.lesson.update({
        where: { id: lessonId },
        data: { deletedAt: null },
      });
      return { success: true as const, data: lesson };
    },
    { roles: ["ADMIN"] }
  );
}

// ============================================================
// Hard delete (permanent removal)
// ============================================================

export async function hardDeleteCourse(courseId: string) {
  return withAuth(
    async () => {
      await prisma.$executeRaw`DELETE FROM "Course" WHERE id = ${courseId}`;
      return { success: true as const, data: null };
    },
    { roles: ["ADMIN"] }
  );
}

export async function hardDeleteLesson(lessonId: string) {
  return withAuth(
    async () => {
      await prisma.$executeRaw`DELETE FROM "Lesson" WHERE id = ${lessonId}`;
      return { success: true as const, data: null };
    },
    { roles: ["ADMIN"] }
  );
}
