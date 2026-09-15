import { prismaUnscoped } from "@/lib/prisma";

/**
 * Окончательное удаление из Корзины.
 *
 * Строку ищем через prismaUnscoped. Обычный prisma обёрнут расширением мягкого
 * удаления и дописывает deletedAt: null во все поиски Course и Lesson, а у
 * всего, что лежит в Корзине, deletedAt как раз проставлен: поиск молча
 * возвращал null, и окончательное удаление не срабатывало никогда.
 *
 * Удаляем только то, что уже в Корзине. Курс уносит каскадом уроки, группы,
 * записи и оплаты, и живой курс не должен исчезать одним вызовом в обход неё.
 *
 * Запись в журнал и DELETE идут одной транзакцией. Строка исчезает навсегда
 * вместе с каскадом, а у каскадных жертв собственных записей в аудите нет —
 * их удаляет база, а не код. createAuditLog для этого не годится: он глотает
 * ошибку, и удаление состоялось бы при незаписанном журнале.
 *
 * Обычный модуль, а не "use server": права проверяют вызывающие действия,
 * а сама логика проверяется scripts/check-billing-db.ts на настоящей базе.
 */
export async function hardDeleteCourseRecord(courseId: string, userId: string) {
  const course = await prismaUnscoped.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      slug: true,
      deletedAt: true,
      // Что унесёт каскад. Payment здесь не опечатка: окончательное удаление
      // курса стирает и историю оплат.
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
    return { ok: false as const, error: "courseNotFound" };
  }
  if (!course.deletedAt) {
    return { ok: false as const, error: "notInTrash" };
  }

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        userId,
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

  return { ok: true as const };
}

export async function hardDeleteLessonRecord(lessonId: string, userId: string) {
  const lesson = await prismaUnscoped.lesson.findUnique({
    where: { id: lessonId },
    select: { title: true, slug: true, courseId: true, deletedAt: true },
  });

  if (!lesson) {
    return { ok: false as const, error: "lessonNotFound" };
  }
  if (!lesson.deletedAt) {
    return { ok: false as const, error: "notInTrash" };
  }

  // Каскад от урока считаем по самим моделям, а не через _count —
  // так имена полей связей не участвуют и ошибиться негде
  const [assessments, homeworks, progress] = await Promise.all([
    prismaUnscoped.assessment.count({ where: { lessonId } }),
    prismaUnscoped.homework.count({ where: { lessonId } }),
    prismaUnscoped.lessonProgress.count({ where: { lessonId } }),
  ]);

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        userId,
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

  return { ok: true as const };
}
