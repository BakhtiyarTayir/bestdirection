import { Injectable } from "@nestjs/common";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Сводка на главной кабинета. Перенесено из
 * src/app/[locale]/(dashboard)/dashboard/page.tsx в web.
 *
 * Считает по роли вызывающего: администратор видит школу целиком,
 * преподаватель — свои курсы, остальные — себя.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async summary(user: SessionUser) {
    if (user.role === "ADMIN") return this.forAdmin();
    if (user.role === "TEACHER") return this.forTeacher(user.id);
    return this.forStudent(user.id);
  }

  private async forAdmin() {
    const [users, courses, students, teachers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.course.count(),
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.user.count({ where: { role: "TEACHER" } }),
    ]);
    return { role: "ADMIN" as const, users, courses, students, teachers };
  }

  private async forTeacher(teacherId: string) {
    const [courses, students] = await Promise.all([
      this.prisma.course.count({ where: { teacherId } }),
      // Учеников считаем по головам, а не по записям: один и тот же ученик
      // может ходить на два курса преподавателя. Курсы в Корзине исключаем
      // явно — расширение мягкого удаления фильтрует только саму модель
      // запроса, вложенные связи нужно фильтровать руками.
      this.prisma.enrollment
        .findMany({
          where: { course: { teacherId, deletedAt: null } },
          select: { studentId: true },
          distinct: ["studentId"],
        })
        .then((rows) => rows.length),
    ]);
    return { role: "TEACHER" as const, courses, students };
  }

  private async forStudent(studentId: string) {
    const [courses, tests] = await Promise.all([
      this.prisma.enrollment.count({ where: { studentId, course: { deletedAt: null } } }),
      // Только завершённые попытки: с этапа 4 строка заводится при старте,
      // и незаконченная попытка иначе считалась бы пройденным тестом.
      this.prisma.assessmentAttempt.count({
        where: { studentId, completedAt: { not: null } },
      }),
    ]);
    return { role: "STUDENT" as const, courses, tests };
  }
}
