import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Окончательное удаление из Корзины. Перенесено из src/lib/trash.ts в web.
 *
 * Строку ищем через prismaUnscoped. Обычный клиент обёрнут расширением мягкого
 * удаления и дописывает deletedAt: null во все поиски Course и Lesson, а у
 * всего, что лежит в Корзине, deletedAt как раз проставлен: поиск молча
 * возвращал null, и окончательное удаление не срабатывало никогда.
 *
 * Удаляем только то, что уже в Корзине. Курс уносит каскадом уроки, группы и
 * записи (Enrollment → MonthlyCharge), а живой курс не должен исчезать одним
 * вызовом в обход неё. Оплаты и начисления зарплаты — денежная история на
 * ON DELETE RESTRICT: если они есть, курс не удаляем вовсе (courseHasMoneyHistory
 * ниже), а не полагаемся на каскад.
 *
 * Запись в журнал и DELETE идут одной транзакцией: строка исчезает навсегда
 * вместе с каскадом, и удаление не должно состояться при незаписанном журнале.
 */
@Injectable()
export class TrashService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prismaUnscoped() {
    return this.prismaService.prismaUnscoped;
  }

  async hardDeleteCourseRecord(courseId: string, userId: string) {
    const course = await this.prismaUnscoped.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        slug: true,
        deletedAt: true,
        // Что унесёт каскад. Payment здесь не опечатка: окончательное удаление
        // курса раньше стирало и историю оплат — теперь это FK на RESTRICT
        // (см. courseHasMoneyHistory ниже), а _count.payments остаётся
        // диагностикой каскада для журнала.
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
        // Payment здесь не в SOFT_DELETE_MODELS, поэтому этот count уже
        // включает и «отменённые» (deletedAt проставлен) оплаты — ровно то,
        // что нужно: денежная история не должна исчезать, даже если запись
        // об оплате отменена.
      },
    });

    if (!course) return { ok: false as const, error: "courseNotFound" };
    if (!course.deletedAt) return { ok: false as const, error: "notInTrash" };

    // Payment/TeacherSalaryAccrual теперь на ON DELETE RESTRICT — сырой DELETE
    // ниже упал бы ошибкой БД. Проверяем заранее и отвечаем понятным кодом,
    // а не 500-й от Postgres.
    if (course._count.payments > 0) {
      return { ok: false as const, error: "courseHasMoneyHistory" };
    }
    const salaryAccrualsCount = await this.prismaUnscoped.teacherSalaryAccrual.count({ where: { courseId } });
    if (salaryAccrualsCount > 0) {
      return { ok: false as const, error: "courseHasMoneyHistory" };
    }
    // Оплат и начислений зарплаты нет, но каскад unenrollments → MonthlyCharge
    // может нести собственную денежную историю (начисления ученикам без
    // единой оплаты, например при ручной коррекции). amount > 0 — значит,
    // за месяц реально что-то начислено, и это тоже история, а не шум.
    const billedMonthlyChargesCount = await this.prismaUnscoped.monthlyCharge.count({
      where: { enrollment: { courseId }, amount: { gt: 0 } },
    });
    if (billedMonthlyChargesCount > 0) {
      return { ok: false as const, error: "courseHasMoneyHistory" };
    }

    await this.prismaUnscoped.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId,
          entityType: "Course",
          entityId: courseId,
          action: "DELETE",
          metadata: { hardDelete: true, title: course.title, slug: course.slug, cascade: course._count },
        },
      });
      await tx.$executeRaw`DELETE FROM "Course" WHERE id = ${courseId}`;
    });

    return { ok: true as const };
  }

  async hardDeleteLessonRecord(lessonId: string, userId: string) {
    const lesson = await this.prismaUnscoped.lesson.findUnique({
      where: { id: lessonId },
      select: { title: true, slug: true, courseId: true, deletedAt: true },
    });

    if (!lesson) return { ok: false as const, error: "lessonNotFound" };
    if (!lesson.deletedAt) return { ok: false as const, error: "notInTrash" };

    // Каскад от урока считаем по самим моделям, а не через _count —
    // так имена полей связей не участвуют и ошибиться негде
    const [assessments, homeworks, progress] = await Promise.all([
      this.prismaUnscoped.assessment.count({ where: { lessonId } }),
      this.prismaUnscoped.homework.count({ where: { lessonId } }),
      this.prismaUnscoped.lessonProgress.count({ where: { lessonId } }),
    ]);

    await this.prismaUnscoped.$transaction(async (tx) => {
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
}
