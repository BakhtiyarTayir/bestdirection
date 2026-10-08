import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
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

  /** branchId учитывается только у администратора — у других ролей фильтра нет. */
  async summary(user: SessionUser, branchId?: string) {
    if (user.role === "ADMIN") return this.forAdmin(branchId);
    if (user.role === "TEACHER") return this.forTeacher(user.id);
    return this.forStudent(user.id);
  }

  /**
   * С фильтром по филиалу считаем по группам этого филиала, а не только по
   * «домашнему» branchId: ученик может учиться в нескольких филиалах
   * (ловушка 3.8.5 плана филиалов), а у курса своего филиала нет вовсе.
   * - ученики — как на /students?branchId: есть запись в группу филиала;
   * - преподаватели — ведут группу филиала или числятся в нём;
   * - курсы — есть открытая группа в филиале;
   * - пользователи — любое из этого или «домашний» филиал.
   */
  private async forAdmin(branchId?: string) {
    const studentInBranch: Prisma.UserWhereInput | undefined = branchId
      ? { enrollments: { some: { group: { is: { branchId } }, course: { deletedAt: null } } } }
      : undefined;
    // Ведущий группы — group.teacherId, а если он пуст, владелец курса
    // (та же лестница, что в зарплате и «требует внимания»)
    const teacherInBranch: Prisma.UserWhereInput | undefined = branchId
      ? {
          OR: [
            { branchId },
            { taughtGroups: { some: { branchId, isActive: true, course: { deletedAt: null } } } },
            {
              courses: {
                some: {
                  deletedAt: null,
                  groups: { some: { branchId, isActive: true, teacherId: null } },
                },
              },
            },
          ],
        }
      : undefined;

    const [users, courses, students, teachers] = await Promise.all([
      this.prisma.user.count({
        where: branchId
          ? { OR: [{ branchId }, studentInBranch!, { role: "TEACHER", ...teacherInBranch! }] }
          : {},
      }),
      this.prisma.course.count({
        where: branchId ? { groups: { some: { branchId, isActive: true } } } : {},
      }),
      this.prisma.user.count({ where: { role: "STUDENT", ...studentInBranch } }),
      this.prisma.user.count({ where: { role: "TEACHER", ...teacherInBranch } }),
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
