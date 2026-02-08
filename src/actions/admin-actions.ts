"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";

// ============================================================
// Получение удалённых записей
// ============================================================

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

export async function getDeletedUsers() {
  return withAuth(
    async () => {
      const users = await prisma.user.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
      });
      return { success: true as const, data: users };
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
// Восстановление записей
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

export async function restoreUser(userId: string) {
  return withAuth(
    async () => {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: null },
      });
      return { success: true as const, data: user };
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
// Полное удаление (hard delete)
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

export async function hardDeleteUser(userId: string) {
  return withAuth(
    async () => {
      await prisma.$executeRaw`DELETE FROM "User" WHERE id = ${userId}`;
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
