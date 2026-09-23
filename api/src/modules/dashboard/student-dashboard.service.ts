import { ForbiddenException, Injectable } from "@nestjs/common";
import type { SessionUser } from "../../common/auth/session-user";
import { toDateInput } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingService } from "../billing/billing.service";
import { currentDateKey, isoWeekday, SCHOOL_UTC_OFFSET_HOURS } from "../billing/domain/billing";
import { ParentsService } from "../parents/parents.service";

/** Сколько дней вперёд ищем ближайшее занятие, прежде чем сдаться (группа скоро кончается или расписания нет). */
const NEXT_LESSON_SEARCH_DAYS = 60;
/** Больше пяти заданий на главной не показываем — это напоминание, а не список дел */
const MAX_HOMEWORKS = 5;

/** Баланс по одному курсу — урезанная витрина BillingService.studentBilling */
export interface StudentBillingCourse {
  courseId: string;
  courseTitle: string;
  groupName: string | null;
  monthlyPrice: number;
  balance: number;
}

export interface StudentBillingSummary {
  balance: number;
  prepaidFuture: number;
  courses: StudentBillingCourse[];
}

export interface NextLesson {
  groupId: string;
  groupName: string;
  courseTitle: string;
  /** "YYYY-MM-DD" */
  date: string;
  schedule: string | null;
}

export interface HomeworkDue {
  id: string;
  slug: string;
  title: string;
  courseSlug: string;
  courseTitle: string;
  lessonSlug: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
}

export interface StudentDashboardBlock {
  billing: StudentBillingSummary;
  nextLessons: NextLesson[];
  homeworks: HomeworkDue[];
}

/**
 * Главная кабинета ученика и родителя (раздел 3 плана дашборда).
 *
 * Баланс всегда идёт через BillingService.studentBilling — он одни на всю
 * систему знает про заморозку закрытых месяцев, цену группы и аванс за
 * будущее; пересчитывать деньги своим кодом здесь нельзя, иначе цифры
 * разойдутся с карточкой студента у администратора.
 */
@Injectable()
export class StudentDashboardService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly billing: BillingService,
    private readonly parents: ParentsService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Ученик видит только себя, родитель — только своих детей (ParentStudent). */
  async forUser(user: SessionUser) {
    if (user.role === "STUDENT") {
      const block = await this.buildBlock(user.id);
      return { role: "STUDENT" as const, ...block };
    }

    if (user.role === "PARENT") {
      // Без аргумента ParentsService.children отдаёт детей САМОГО вызывающего —
      // тот же путь, что кабинет /my-children. Чужого ребёнка этим способом
      // получить нельзя: id в маршрут вообще не принимается.
      const links = await this.parents.children(undefined, user);
      const children = await Promise.all(
        links.map(async (link) => ({
          studentId: link.student.id,
          firstName: link.student.firstName,
          lastName: link.student.lastName,
          ...(await this.buildBlock(link.student.id)),
        }))
      );
      return { role: "PARENT" as const, children };
    }

    // Персоналу сюда не нужно: у администратора и преподавателя своя сводка
    throw new ForbiddenException("studentOrParentOnly");
  }

  private async buildBlock(studentId: string): Promise<StudentDashboardBlock> {
    const [billing, nextLessons, homeworks] = await Promise.all([
      this.loadBilling(studentId),
      this.loadNextLessons(studentId),
      this.loadHomeworks(studentId),
    ]);
    return { billing, nextLessons, homeworks };
  }

  /** Урезанная витрина studentBilling: итог и по курсам, без чужих платежей и имён сотрудников. */
  private async loadBilling(studentId: string): Promise<StudentBillingSummary> {
    const full = await this.billing.studentBilling(studentId);
    return {
      balance: full.totals.balance,
      prepaidFuture: full.totals.prepaidFuture,
      courses: full.courses.map((course) => ({
        courseId: course.course.id,
        courseTitle: course.course.title,
        groupName: course.group?.name ?? null,
        monthlyPrice: course.monthlyPrice,
        balance: course.balance,
      })),
    };
  }

  /**
   * По каждой активной записи с группой — ближайшая дата занятия по
   * расписанию группы. Курс мог уехать в Корзину — deletedAt на связи
   * фильтруется руками (расширение мягкого удаления не видит вложенные
   * связи, только модель прямого запроса).
   */
  private async loadNextLessons(studentId: string): Promise<NextLesson[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        unenrolledAt: null,
        course: { deletedAt: null },
        groupId: { not: null },
        group: { is: { isActive: true } },
      },
      select: {
        course: { select: { title: true } },
        group: {
          select: {
            id: true,
            name: true,
            schedule: true,
            scheduleDays: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    const today = todayNoonUtc();
    const result: NextLesson[] = [];
    for (const enrollment of enrollments) {
      const group = enrollment.group;
      if (!group) continue;
      const date = nextLessonDate(group, today);
      if (!date) continue;
      result.push({
        groupId: group.id,
        groupName: group.name,
        courseTitle: enrollment.course.title,
        date: toDateInput(date),
        schedule: group.schedule,
      });
    }

    return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /**
   * Задания моих курсов со сроком в будущем, которые я ещё не сдавал —
   * то же понятие «не сдано», что /homework/count (SubmissionsService.counts),
   * упрощённое до «сдач вообще не было»: статус проверки — дело страницы
   * заданий, здесь только напоминание о сроке.
   */
  private async loadHomeworks(studentId: string): Promise<HomeworkDue[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, unenrolledAt: null, course: { deletedAt: null } },
      select: { courseId: true },
    });
    const courseIds = [...new Set(enrollments.map((enrollment) => enrollment.courseId))];
    if (courseIds.length === 0) return [];

    const homeworks = await this.prisma.homework.findMany({
      where: {
        isPublished: true,
        dueDate: { not: null },
        lesson: {
          isPublished: true,
          deletedAt: null,
          courseId: { in: courseIds },
          course: { deletedAt: null },
        },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        dueDate: true,
        lesson: { select: { slug: true, course: { select: { slug: true, title: true } } } },
        submissions: { where: { studentId }, select: { id: true }, take: 1 },
      },
      orderBy: { dueDate: "asc" },
    });

    const today = currentDateKey();
    return homeworks
      .filter((homework) => homework.submissions.length === 0 && toDateInput(homework.dueDate) >= today)
      .slice(0, MAX_HOMEWORKS)
      .map((homework) => ({
        id: homework.id,
        slug: homework.slug,
        title: homework.title,
        courseSlug: homework.lesson.course.slug,
        courseTitle: homework.lesson.course.title,
        lessonSlug: homework.lesson.slug,
        dueDate: toDateInput(homework.dueDate),
      }));
  }
}

/** "Сегодня" по Ташкенту, как полдень UTC — та же условность, что даты в биллинге (см. date-only.ts). */
function todayNoonUtc(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + SCHOOL_UTC_OFFSET_HOURS * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12));
}

/**
 * Ближайшая дата занятия группы на день ≥ from по её дням недели, в рамках
 * startDate/endDate. Null — в ближайшие NEXT_LESSON_SEARCH_DAYS занятий нет:
 * расписание не задано или группа заканчивается раньше.
 */
function nextLessonDate(
  group: { scheduleDays: number[]; startDate: Date | null; endDate: Date | null },
  from: Date
): Date | null {
  if (group.scheduleDays.length === 0) return null;
  const days = new Set(group.scheduleDays);
  const start = group.startDate && group.startDate.getTime() > from.getTime() ? group.startDate : from;

  for (let i = 0; i < NEXT_LESSON_SEARCH_DAYS; i++) {
    const day = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i, 12)
    );
    if (group.endDate && day.getTime() > group.endDate.getTime()) return null;
    if (days.has(isoWeekday(day))) return day;
  }
  return null;
}
