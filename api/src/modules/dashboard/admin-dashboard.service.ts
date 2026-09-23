import { Injectable } from "@nestjs/common";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingService } from "../billing/billing.service";
import {
  addMonths,
  countLessons,
  currentDateKey,
  currentMonthKey,
  isoWeekday,
  monthStart,
} from "../billing/domain/billing";
import { FinanceService } from "../finance/finance.service";
import { SalaryService } from "../salary/salary.service";

/** Группа, отобранная для проверок 1.2/1.3 — общий набор полей на оба расчёта. */
interface AttentionGroup {
  id: string;
  salaryPercentBp: number | null;
  teacherId: string | null;
  scheduleDays: number[];
  startDate: Date | null;
  course: { teacherId: string };
}

/**
 * Главная панель администратора (план дашборда, раздел 1): деньги за месяц,
 * занятия «сегодня» по расписанию и список «требует внимания».
 *
 * Деньги считаются ТОЛЬКО через FinanceService/BillingService/SalaryService —
 * свой пересчёт запрещён явно (план, 1.1), иначе цифры на главной разойдутся
 * со страницами «Финансы», «Должники» и «Зарплата».
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly finance: FinanceService,
    private readonly billing: BillingService,
    private readonly salary: SalaryService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async overview(branchId: string | undefined, actor: SessionUser) {
    const [finance, debtors, salaryOverview] = await Promise.all([
      this.finance.overview({ branchId }),
      this.billing.debtors({ branchId }),
      this.salary.overview({ branchId }, actor),
    ]);

    const prevMonth = addMonths(finance.month, -1);
    const prevEntry = finance.months.find((entry) => entry.month === prevMonth);
    // Нет прошлого месяца (сентябрь 2026 — первый месяц учёта) или он был
    // нулевым — сравнивать не с чем, а не «−100 %»
    const receivedChangePercent =
      prevEntry && prevEntry.received > 0
        ? ((finance.current.received - prevEntry.received) / prevEntry.received) * 100
        : null;

    const [today, attention] = await Promise.all([
      this.todaySchedule(branchId),
      this.attentionCounts(branchId),
    ]);

    return {
      month: finance.month,
      date: currentDateKey(),
      money: {
        received: finance.current.received,
        receivedChangePercent,
        debtTotal: debtors.totalDebt,
        debtorsCount: debtors.debtors.length,
        teacherDebt: salaryOverview.totals.debt,
        cashProfit: finance.current.cashProfit,
      },
      today,
      attention,
    };
  }

  /**
   * 1.2 «Сегодня»: группы, у которых сегодня (по Ташкенту) день занятий по
   * расписанию, и отмечено ли занятие в журнале.
   */
  private async todaySchedule(branchId?: string) {
    const todayDate = toNoonUtc(currentDateKey());
    const weekday = isoWeekday(todayDate);

    const groups = await this.prisma.group.findMany({
      where: {
        isActive: true,
        course: { deletedAt: null },
        scheduleDays: { has: weekday },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: todayDate } }] },
          { OR: [{ endDate: null }, { endDate: { gte: todayDate } }] },
        ],
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        name: true,
        schedule: true,
        teacherId: true,
        teacher: { select: { firstName: true, lastName: true } },
        branch: { select: { id: true, name: true } },
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            teacherId: true,
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
    });

    const groupIds = groups.map((group) => group.id);
    const sessions =
      groupIds.length > 0
        ? await this.prisma.attendanceSession.findMany({
            where: { groupId: { in: groupIds }, date: todayDate },
            select: { groupId: true },
          })
        : [];
    const markedGroupIds = new Set(sessions.map((session) => session.groupId));

    const lessons = groups.map((group) => {
      // Ведущий: свой у группы, иначе — у курса (та же лестница, что в
      // salary.service.ts и attendance-access.ts)
      const teacher = group.teacher ?? group.course.teacher;
      return {
        groupId: group.id,
        groupName: group.name,
        courseId: group.course.id,
        courseSlug: group.course.slug,
        courseTitle: group.course.title,
        branchId: group.branch.id,
        branchName: group.branch.name,
        teacherName: `${teacher.lastName} ${teacher.firstName}`,
        schedule: group.schedule,
        marked: markedGroupIds.has(group.id),
      };
    });

    return {
      markedCount: lessons.filter((lesson) => lesson.marked).length,
      totalCount: lessons.length,
      lessons,
    };
  }

  /** 1.3 «Требует внимания»: пять счётчиков, нулевые прячет уже web. */
  private async attentionCounts(branchId?: string) {
    const [pendingRequests, uncontactedLeads, studentsWithoutGroup, groups] = await Promise.all([
      // У заявки на курс нет филиала (как и у CourseLead ниже) — при фильтре
      // по филиалу этот пункт не фильтруется (план, 1.3)
      this.prisma.enrollmentRequest.count({ where: { status: "PENDING" } }),
      // У заявок с сайта нет филиала — тот же случай
      this.prisma.courseLead.count({ where: { contacted: false } }),
      // У Enrollment своего филиала нет (ловушка 3.8.3 плана филиалов):
      // фильтровать студентов без группы по филиалу нечем — они как раз без группы
      this.prisma.enrollment.count({
        where: {
          groupId: null,
          unenrolledAt: null,
          course: { deletedAt: null },
          student: { deletedAt: null },
        },
      }),
      this.prisma.group.findMany({
        where: {
          isActive: true,
          course: { deletedAt: null },
          ...(branchId ? { branchId } : {}),
        },
        select: {
          id: true,
          salaryPercentBp: true,
          teacherId: true,
          scheduleDays: true,
          startDate: true,
          course: { select: { teacherId: true } },
        },
      }),
    ]);

    const [groupsWithoutRate, groupsWithIncompleteJournal] = await Promise.all([
      this.countGroupsWithoutRate(groups),
      this.countGroupsWithIncompleteJournal(groups),
    ]);

    return {
      pendingRequests,
      uncontactedLeads,
      studentsWithoutGroup,
      groupsWithoutRate,
      groupsWithIncompleteJournal,
    };
  }

  /**
   * Группы без ставки зарплаты: у самой группы ставка пуста, и у ведущего
   * (group.teacherId ?? course.teacherId) личная ставка тоже пуста.
   */
  private async countGroupsWithoutRate(groups: AttentionGroup[]): Promise<number> {
    const candidates = groups.filter((group) => group.salaryPercentBp === null);
    if (candidates.length === 0) return 0;

    const ownerIds = [...new Set(candidates.map((group) => group.teacherId ?? group.course.teacherId))];
    // prismaUnscoped: уволенный (удалённый) ведущий не должен выпасть из
    // проверки молча — та же причина, что у loadUnits в salary.service.ts
    const owners = await this.prismaService.prismaUnscoped.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, salaryPercentBp: true },
    });
    const rateByOwner = new Map(owners.map((owner) => [owner.id, owner.salaryPercentBp]));

    return candidates.filter((group) => {
      const ownerId = group.teacherId ?? group.course.teacherId;
      return (rateByOwner.get(ownerId) ?? null) === null;
    }).length;
  }

  /**
   * Группы с неполным журналом за текущий месяц: занятий по расписанию с
   * начала месяца (или startDate группы, если он позже) по сегодня больше,
   * чем отметок в журнале (AttendanceSession). Важно для зарплаты — при
   * неполном журнале замены не попадают в раскладку (правило «вариант А»).
   */
  private async countGroupsWithIncompleteJournal(groups: AttentionGroup[]): Promise<number> {
    const withSchedule = groups.filter((group) => group.scheduleDays.length > 0);
    if (withSchedule.length === 0) return 0;

    const today = toNoonUtc(currentDateKey());
    const monthFrom = monthStart(currentMonthKey());
    const groupIds = withSchedule.map((group) => group.id);

    const sessions = await this.prisma.attendanceSession.findMany({
      where: { groupId: { in: groupIds }, date: { gte: monthFrom, lte: today } },
      select: { groupId: true, date: true },
    });
    const sessionDatesByGroup = new Map<string, Date[]>();
    for (const session of sessions) {
      if (!session.groupId) continue;
      const list = sessionDatesByGroup.get(session.groupId) ?? [];
      list.push(session.date);
      sessionDatesByGroup.set(session.groupId, list);
    }

    let count = 0;
    for (const group of withSchedule) {
      const from =
        group.startDate && group.startDate.getTime() > monthFrom.getTime() ? group.startDate : monthFrom;
      // Группа ещё не начала заниматься в этом месяце — журналу нечего показать
      if (from.getTime() > today.getTime()) continue;

      const planned = countLessons(group.scheduleDays, from, today);
      const actual = (sessionDatesByGroup.get(group.id) ?? []).filter(
        (date) => date.getTime() >= from.getTime()
      ).length;
      if (planned > actual) count++;
    }
    return count;
  }
}
