import { ForbiddenException, Injectable } from "@nestjs/common";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Prisma } from "../../../generated/prisma";
import { currentDateKey, currentMonthKey, isoWeekday } from "../billing/domain/billing";
import { SalaryService } from "../salary/salary.service";

/**
 * «Мои группы» преподавателя: та же лестница, что и везде в проекте
 * (attendance-access.ts responsibleTeacherId, enrollmentTeacherFilter в
 * billing-ledger.service.ts, loadUnits в salary.service.ts) — педагог группы,
 * а если у группы педагог не задан, то педагог курса. Здесь она собрана как
 * Prisma-фильтр для модели Group: ни один из существующих фильтров не даёт
 * такой сразу — enrollmentTeacherFilter фильтрует Enrollment, а не Group.
 */
export function myGroupsFilter(teacherId: string): Prisma.GroupWhereInput {
  return {
    OR: [{ teacherId }, { teacherId: null, course: { teacherId } }],
  };
}

/** Полночь UTC для календарной даты "YYYY-MM-DD" — та же условность, что у AttendanceSession.date (attendance.service.ts). */
export function toUtcMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Обратное преобразование: дата → "YYYY-MM-DD" по UTC-компонентам. */
export function dateKeyOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, delta: number): Date {
  return new Date(date.getTime() + delta * 86_400_000);
}

/** "2026-09-23" → "23.09" — короткая дата для списка неотмеченных занятий (formatDate из web даёт год, здесь он не нужен). */
export function toDdMm(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${day}.${month}`;
}

/** Первый день недели (понедельник) для даты, по её ISO-дню недели. */
function weekStartOf(date: Date): Date {
  return addDays(date, -(isoWeekday(date) - 1));
}

interface GroupInfo {
  groupId: string;
  groupName: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  branchId: string;
  branchName: string;
  schedule: string | null;
  scheduleDays: number[];
  startDateKey: string | null;
  endDateKey: string | null;
}

export interface TeacherScheduleLesson {
  groupId: string;
  groupName: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  branchId: string;
  branchName: string;
  schedule: string | null;
  /** true/false — занятие в прошлом или сегодня; null — в будущем, отмечать ещё нечего */
  marked: boolean | null;
  /** Занятие в журнале на день вне расписания группы — отработка */
  isMakeup: boolean;
}

export interface TeacherScheduleDay {
  date: string;
  /** ISO: 1 = понедельник … 7 = воскресенье */
  weekday: number;
  lessons: TeacherScheduleLesson[];
}

/**
 * День-за-днём расписание моих групп на диапазон [rangeStart; rangeEnd]
 * (обе границы — ключи "YYYY-MM-DD", включительно) с отметками журнала.
 *
 * Чистая функция: вызывающий уже загрузил группы и сессии за диапазон —
 * тот же приём, что в domain/billing.ts и domain/salary.ts, ради теста без
 * обращений к базе.
 */
export function buildSchedule(
  groups: GroupInfo[],
  sessionDateKeysByGroup: Map<string, Set<string>>,
  rangeStart: string,
  rangeEnd: string,
  todayKey: string
): TeacherScheduleDay[] {
  const days: TeacherScheduleDay[] = [];
  let cursor = toUtcMidnight(rangeStart);
  const end = toUtcMidnight(rangeEnd);

  while (cursor.getTime() <= end.getTime()) {
    const dateKey = dateKeyOf(cursor);
    const weekday = isoWeekday(cursor);
    const lessons: TeacherScheduleLesson[] = [];

    for (const group of groups) {
      const inSchedule =
        group.scheduleDays.includes(weekday) &&
        (!group.startDateKey || group.startDateKey <= dateKey) &&
        (!group.endDateKey || group.endDateKey >= dateKey);
      const hasSession = sessionDateKeysByGroup.get(group.groupId)?.has(dateKey) ?? false;

      if (inSchedule) {
        lessons.push({
          groupId: group.groupId,
          groupName: group.groupName,
          courseId: group.courseId,
          courseTitle: group.courseTitle,
          courseSlug: group.courseSlug,
          branchId: group.branchId,
          branchName: group.branchName,
          schedule: group.schedule,
          marked: dateKey <= todayKey ? hasSession : null,
          isMakeup: false,
        });
      } else if (hasSession) {
        // Занятие в журнале на день вне расписания группы — отработка
        // (описание в плане, понятие рядом с markMakeupSessions в
        // salary/domain/salary.ts, но там отработки считаются по превышению
        // числа занятий, а не по дню недели — для расписания дашборда
        // честнее и проще признак «есть отметка не в плановый день»)
        lessons.push({
          groupId: group.groupId,
          groupName: group.groupName,
          courseId: group.courseId,
          courseTitle: group.courseTitle,
          courseSlug: group.courseSlug,
          branchId: group.branchId,
          branchName: group.branchName,
          schedule: group.schedule,
          marked: true,
          isMakeup: true,
        });
      }
    }

    days.push({ date: dateKey, weekday, lessons });
    cursor = addDays(cursor, 1);
  }

  return days;
}

export interface UnmarkedGroup {
  groupId: string;
  groupName: string;
  courseTitle: string;
  courseSlug: string;
  dates: string[];
}

/**
 * Неотмеченные занятия за месяц по каждой группе: прошедшие (включая
 * сегодня) плановые занятия месяца, на которые нет отметки в журнале.
 * Отработки в список не попадают — они уже отмечены по определению.
 */
export function unmarkedThisMonth(days: TeacherScheduleDay[], month: string): UnmarkedGroup[] {
  const byGroup = new Map<string, UnmarkedGroup>();

  for (const day of days) {
    if (!day.date.startsWith(`${month}-`)) continue;
    for (const lesson of day.lessons) {
      if (lesson.isMakeup || lesson.marked !== false) continue;
      const entry = byGroup.get(lesson.groupId) ?? {
        groupId: lesson.groupId,
        groupName: lesson.groupName,
        courseTitle: lesson.courseTitle,
        courseSlug: lesson.courseSlug,
        dates: [] as string[],
      };
      entry.dates.push(toDdMm(day.date));
      byGroup.set(lesson.groupId, entry);
    }
  }

  return [...byGroup.values()];
}

/**
 * Панель преподавателя на главной. Своя часть плана дашборда (раздел 2):
 * мои занятия сегодня / расписание недели-месяца / неотмеченные занятия /
 * своя зарплата за месяц / нынешние счётчики (курсы, ученики).
 */
@Injectable()
export class TeacherDashboardService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly salary: SalaryService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async summary(actor: SessionUser) {
    // Администратору здесь делать нечего — у него своя панель (раздел 1
    // плана); решение владельца через координатора — отдать 403, а не
    // молча подставлять пустые данные под чужую роль.
    if (actor.role !== "TEACHER") {
      throw new ForbiddenException("teacherOnly");
    }
    const teacherId = actor.id;

    const todayKey = currentDateKey();
    const month = currentMonthKey();
    const today = toUtcMidnight(todayKey);
    const weekStart = weekStartOf(today);
    const weekEnd = addDays(weekStart, 6);
    const monthStartDate = toUtcMidnight(`${month}-01`);
    // Последний день месяца — через первый день следующего минус сутки,
    // без обращения к monthEnd(billing.ts): он отдаёт полдень UTC, а здесь
    // весь расчёт ведётся в датах-ключах, полночь удобнее не смешивать
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonthStart = new Date(Date.UTC(year, monthNumber, 1));
    const monthEndDate = addDays(nextMonthStart, -1);

    const rangeStart = weekStart.getTime() < monthStartDate.getTime() ? weekStart : monthStartDate;
    const rangeEnd = weekEnd.getTime() > monthEndDate.getTime() ? weekEnd : monthEndDate;

    const groups = await this.prisma.group.findMany({
      where: {
        isActive: true,
        // Мягкое удаление курса расширение фильтрует только саму модель
        // запроса — вложенную связь course нужно фильтровать явно (см.
        // тот же приём в dashboard.service.ts и salary.service.ts)
        course: { deletedAt: null },
        ...myGroupsFilter(teacherId),
      },
      select: {
        id: true,
        name: true,
        schedule: true,
        scheduleDays: true,
        startDate: true,
        endDate: true,
        branchId: true,
        branch: { select: { name: true } },
        course: { select: { id: true, title: true, slug: true } },
      },
    });

    const groupInfos: GroupInfo[] = groups.map((group) => ({
      groupId: group.id,
      groupName: group.name,
      courseId: group.course.id,
      courseTitle: group.course.title,
      courseSlug: group.course.slug,
      branchId: group.branchId,
      branchName: group.branch.name,
      schedule: group.schedule,
      scheduleDays: group.scheduleDays,
      startDateKey: group.startDate ? dateKeyOf(group.startDate) : null,
      endDateKey: group.endDate ? dateKeyOf(group.endDate) : null,
    }));

    const groupIds = groupInfos.map((group) => group.groupId);
    const sessions =
      groupIds.length > 0
        ? await this.prisma.attendanceSession.findMany({
            where: {
              groupId: { in: groupIds },
              date: { gte: rangeStart, lte: rangeEnd },
            },
            select: { groupId: true, date: true },
          })
        : [];

    const sessionDateKeysByGroup = new Map<string, Set<string>>();
    for (const session of sessions) {
      if (!session.groupId) continue;
      const set = sessionDateKeysByGroup.get(session.groupId) ?? new Set<string>();
      set.add(dateKeyOf(session.date));
      sessionDateKeysByGroup.set(session.groupId, set);
    }

    const days = buildSchedule(
      groupInfos,
      sessionDateKeysByGroup,
      dateKeyOf(rangeStart),
      dateKeyOf(rangeEnd),
      todayKey
    );

    const todayLessons = days.find((day) => day.date === todayKey)?.lessons ?? [];

    // Своя зарплата — только через SalaryService, чтобы цифры на главной не
    // разошлись со страницей /salaries/me (план, раздел 0)
    const salaryDetail = await this.salary.teacherDetail(teacherId, { month }, actor);
    // «Начислено за месяц» — сумма по всем моим группам ИМЕННО за текущий
    // месяц (groups[].months, где month === текущий), а не накопленный итог:
    // accruedTotal у teacherDetail считается с начала работы преподавателя
    // (те же цифры показывает /salaries/me под подписью «...к месяцу»), и
    // для карточки «моя зарплата за месяц» это было бы нечестно назвать
    // «за месяц». Выдано и долг честно берём накопленным итогом, как их и
    // считает teacherDetail: выплата и долг — по своей природе накопленные
    // величины, а не привязанные к одному месяцу.
    const accruedThisMonth = salaryDetail.groups.reduce((sum, group) => {
      const current = group.months.find((item) => item.month === month);
      return sum + (current?.amount ?? 0);
    }, 0);

    // Нынешние счётчики (мои курсы, ученики) — тот же расчёт, что в
    // DashboardService.forTeacher (dashboard.service.ts), продублирован
    // здесь намеренно: общий сервис не экспортирован, а раздел 2 плана
    // просит свой сервис в своих файлах, чтобы ветки сливались без правок
    // чужого кода
    const [courses, students] = await Promise.all([
      this.prisma.course.count({ where: { teacherId } }),
      this.prisma.enrollment
        .findMany({
          where: { course: { teacherId, deletedAt: null } },
          select: { studentId: true },
          distinct: ["studentId"],
        })
        .then((rows) => rows.length),
    ]);

    return {
      today: {
        date: todayKey,
        markedCount: todayLessons.filter((lesson) => lesson.marked === true).length,
        totalCount: todayLessons.length,
      },
      unmarkedThisMonth: unmarkedThisMonth(days, month),
      schedule: {
        weekStart: dateKeyOf(weekStart),
        weekEnd: dateKeyOf(weekEnd),
        month,
        days,
      },
      salary: {
        month,
        accruedThisMonth,
        paidTotal: salaryDetail.paidTotal,
        debt: salaryDetail.debt,
      },
      courses,
      students,
    };
  }
}
