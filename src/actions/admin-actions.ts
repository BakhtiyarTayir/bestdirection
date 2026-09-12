"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";

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

/**
 * Жёсткое удаление и запись в журнал идут ОДНОЙ транзакцией.
 *
 * Здесь журнал не «желателен», а обязателен: строка исчезает навсегда, а вместе
 * с ней — всё, что висит на ней через onDelete: Cascade, причём у каскадных
 * жертв собственных записей в аудите не появляется (их удаляет база, а не код).
 * Именно так однажды бесследно пропала группа: удалили курс из Корзины.
 *
 * createAuditLog для этого не подходит — он глотает ошибку в catch, и удаление
 * состоялось бы даже при незаписанном журнале. В транзакции наоборот: не легла
 * запись — не состоялось и удаление.
 */
export async function hardDeleteCourse(courseId: string) {
  return withAuth(
    async (session) => {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          title: true,
          slug: true,
          deletedAt: true,
          // Что именно унесёт каскад вместе с курсом. Payment здесь не
          // опечатка: жёсткое удаление курса стирает и историю оплат.
          _count: {
            select: {
              lessons: true,
              groups: true,
              enrollments: true,
              enrollmentRequests: true,
              payments: true,
              assessments: true,
              attendanceSessions: true,
            },
          },
        },
      });

      if (!course) {
        return { success: false as const, error: "courseNotFound" };
      }

      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            entityType: "Course",
            entityId: courseId,
            action: "DELETE",
            metadata: {
              hardDelete: true,
              title: course.title,
              slug: course.slug,
              cascade: course._count,
            },
          },
        });

        await tx.$executeRaw`DELETE FROM "Course" WHERE id = ${courseId}`;
      });

      return { success: true as const, data: null };
    },
    { roles: ["ADMIN"] }
  );
}

export async function hardDeleteLesson(lessonId: string) {
  return withAuth(
    async (session) => {
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { title: true, slug: true, courseId: true },
      });

      if (!lesson) {
        return { success: false as const, error: "lessonNotFound" };
      }

      // Каскад от урока: считаем по самим моделям, а не через _count —
      // так имена полей связей не участвуют и ошибиться негде
      const [assessments, homeworks, progress] = await Promise.all([
        prisma.assessment.count({ where: { lessonId } }),
        prisma.homework.count({ where: { lessonId } }),
        prisma.lessonProgress.count({ where: { lessonId } }),
      ]);

      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            entityType: "Lesson",
            entityId: lessonId,
            action: "DELETE",
            metadata: {
              hardDelete: true,
              title: lesson.title,
              slug: lesson.slug,
              courseId: lesson.courseId,
              cascade: { assessments, homeworks, progress },
            },
          },
        });

        await tx.$executeRaw`DELETE FROM "Lesson" WHERE id = ${lessonId}`;
      });

      return { success: true as const, data: null };
    },
    { roles: ["ADMIN"] }
  );
}
