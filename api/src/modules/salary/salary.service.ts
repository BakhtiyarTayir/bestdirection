import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingLedgerService, type LoadedEnrollment } from "../billing/billing-ledger.service";
import {
  addMonths,
  computeFormulaAmount,
  isClosedMonth,
  isValidMonth,
  mergeAccrualMonths,
  monthKey,
  payoutMonth,
  totalAccrued,
  type MonthAccrual,
} from "./domain/salary";
import type { RecalcQueryDto, SalaryOverviewQueryDto, TeacherSalaryQueryDto } from "./dto/salary.dto";

/** Единица начисления: преподаватель + группа, либо преподаватель + курс без группы (groupId пуст). */
interface Unit {
  teacherId: string;
  teacherName: string;
  teacherPercentBp: number | null;
  courseId: string;
  courseTitle: string;
  groupId: string | null;
  groupName: string | null;
  branchId: string | null;
  groupPercentBp: number | null;
}

/**
 * Фильтр единиц начисления. groupId различает «не фильтровать по группе»
 * (undefined) и «только записи БЕЗ группы» (null) — это нужно точечной
 * заморозке при переводе/отчислении ученика (freezeClosedMonths).
 */
interface UnitFilters {
  groupId?: string | null;
  courseId?: string;
  teacherId?: string;
  branchId?: string;
}

/**
 * Начисления зарплаты преподавателям и их долг перед центром. Модуль
 * переиспользует BillingLedgerService: база берётся из уже посчитанных и
 * замороженных начислений учеников (MonthlyCharge), сама зарплата не трогает
 * биллинг учеников напрямую.
 *
 * Порядок расчёта (план зарплат, 5.6): сначала BillingLedgerService
 * замораживает закрытые месяцы учеников, и только потом считается зарплата —
 * иначе база взялась бы из ещё не зафиксированных данных.
 */
@Injectable()
export class SalaryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly ledger: BillingLedgerService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Единицы начисления: все группы (кроме курсов в Корзине) и курсы, у
   * которых есть записи без группы. Педагог единицы определяется той же
   * лестницей, что и в посещаемости (attendance-access.ts): педагог группы →
   * педагог курса.
   *
   * Без фильтра мягкого удаления для преподавателя: закрытый месяц удалённого
   * (уволенного) преподавателя не должен пропасть из отчёта без имени — тот
   * же приём, что в teacher-attendance.service.ts.
   */
  private async loadUnits(filters: UnitFilters = {}): Promise<Unit[]> {
    // groupId различает три случая: undefined — без фильтра по группе,
    // null — только единицы БЕЗ группы, строка — одна конкретная группа
    const wantsUngroupedOnly = filters.groupId === null;
    const wantsSpecificGroup = typeof filters.groupId === "string";

    const groups = wantsUngroupedOnly
      ? []
      : await this.prisma.group.findMany({
          where: {
            course: { deletedAt: null },
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
            ...(wantsSpecificGroup ? { id: filters.groupId as string } : {}),
            ...(filters.courseId ? { courseId: filters.courseId } : {}),
          },
          select: {
            id: true,
            name: true,
            branchId: true,
            salaryPercentBp: true,
            teacherId: true,
            course: { select: { id: true, title: true, teacherId: true } },
          },
        });

    const groupUnits = groups.map((group) => ({
      teacherId: group.teacherId ?? group.course.teacherId,
      courseId: group.course.id,
      courseTitle: group.course.title,
      groupId: group.id,
      groupName: group.name,
      branchId: group.branchId,
      groupPercentBp: group.salaryPercentBp,
    }));

    // Курсы с записями без группы. Снимка филиала у них нет (ловушка
    // withoutGroup — см. LedgerFilters в billing-ledger.service.ts): при
    // заданном фильтре по филиалу такие записи не попадают в список, сузить
    // их по филиалу нечем.
    const ungroupedCourses =
      filters.branchId || wantsSpecificGroup
        ? []
        : await this.prisma.course.findMany({
            where: {
              deletedAt: null,
              enrollments: { some: { groupId: null } },
              ...(filters.courseId ? { id: filters.courseId } : {}),
            },
            select: { id: true, title: true, teacherId: true },
          });

    const courseUnits = ungroupedCourses.map((course) => ({
      teacherId: course.teacherId,
      courseId: course.id,
      courseTitle: course.title,
      groupId: null as string | null,
      groupName: null as string | null,
      branchId: null as string | null,
      groupPercentBp: null as number | null,
    }));

    const raw = [...groupUnits, ...courseUnits].filter(
      (unit) => !filters.teacherId || unit.teacherId === filters.teacherId
    );
    if (raw.length === 0) return [];

    const teacherIds = [...new Set(raw.map((unit) => unit.teacherId))];
    const teachers = await this.prismaService.prismaUnscoped.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true, salaryPercentBp: true },
    });
    const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));

    return raw.map((unit) => {
      const teacher = teacherById.get(unit.teacherId);
      return {
        ...unit,
        teacherName: teacher ? `${teacher.lastName} ${teacher.firstName}` : "",
        teacherPercentBp: teacher?.salaryPercentBp ?? null,
      };
    });
  }

  /** Записи на курс, входящие в единицу: по группе или (для groupId=null) по курсу без группы. */
  private async loadUnitEnrollments(unit: Pick<Unit, "groupId" | "courseId">): Promise<LoadedEnrollment[]> {
    if (unit.groupId) {
      return this.ledger.loadBillableEnrollments({ groupId: unit.groupId });
    }
    const enrollments = await this.ledger.loadBillableEnrollments({ courseId: unit.courseId });
    return enrollments.filter((enrollment) => enrollment.group === null);
  }

  /**
   * Расписание начислений одной единицы по месяцам с учётом реестра
   * TeacherSalaryAccrual — прямой аналог BillingLedgerService.resolveSchedules,
   * только база агрегируется по всем ученикам единицы, а не по одной записи.
   *
   * Закрытый месяц без строки фиксируется тут же (лазурная заморозка, как у
   * начислений учеников): повторные и параллельные вызовы безопасны —
   * уникальный индекс (teacherId, courseId, groupId, month) плюс частичный
   * индекс для groupId IS NULL, оба плюс skipDuplicates.
   */
  private async unitSchedule(unit: Unit, upToMonth: string): Promise<MonthAccrual[]> {
    const enrollments = await this.loadUnitEnrollments(unit);
    const schedules = await this.ledger.resolveSchedules(enrollments, upToMonth);

    const monthTotals = new Map<string, { base: number; studentsCount: number }>();
    for (const enrollment of enrollments) {
      for (const item of schedules.get(enrollment.id) ?? []) {
        const totals = monthTotals.get(item.month) ?? { base: 0, studentsCount: 0 };
        totals.base += item.charge.amount;
        // Считаются ученики, за которых в этом месяце что-то начислено —
        // те же, за кого преподаватель получает процент
        if (item.charge.amount > 0) totals.studentsCount += 1;
        monthTotals.set(item.month, totals);
      }
    }

    const computed = [...monthTotals.entries()].map(([month, totals]) => ({
      month,
      input: {
        base: totals.base,
        studentsCount: totals.studentsCount,
        groupPercentBp: unit.groupPercentBp,
        teacherPercentBp: unit.teacherPercentBp,
        manualAmount: null,
      },
    }));

    const storedRows = await this.prisma.teacherSalaryAccrual.findMany({
      where: { teacherId: unit.teacherId, courseId: unit.courseId, groupId: unit.groupId, month: { lte: upToMonth } },
      select: { month: true, base: true, studentsCount: true, percentUsed: true, amount: true, manualAmount: true },
    });

    const now = new Date();
    const months = mergeAccrualMonths(computed, storedRows, now);

    const toFreeze = months
      .filter((item) => !item.locked && isClosedMonth(item.month, now))
      .map((item) => ({
        teacherId: unit.teacherId,
        courseId: unit.courseId,
        groupId: unit.groupId,
        branchId: unit.branchId,
        month: item.month,
        base: item.accrual.base,
        percentUsed: item.accrual.percentUsed,
        amount: item.accrual.amount,
        studentsCount: item.accrual.studentsCount,
        lockedAt: now,
      }));

    if (toFreeze.length > 0) {
      await this.prisma.teacherSalaryAccrual.createMany({ data: toFreeze, skipDuplicates: true });
    }

    return months;
  }

  /**
   * Фиксирует закрытые месяцы затронутых начислений ПЕРЕД изменением входов
   * расчёта — педагога/цены/расписания/процента группы, перевода или
   * отчисления ученика, смены процента преподавателя.
   *
   * Вызывается СТРОГО ПОСЛЕ BillingLedgerService.freezeClosedMonths в том же
   * месте: зарплата опирается на уже зафиксированные начисления учеников
   * (план зарплат, 5.4). Идемпотентно — уже замороженные месяцы не трогаются.
   */
  async freezeClosedMonths(filters: UnitFilters): Promise<void> {
    const units = await this.loadUnits(filters);
    if (units.length === 0) return;

    // Последний закрытый месяц — предыдущий: текущий ещё открыт
    const lastClosedMonth = addMonths(monthKey(new Date()), -1);
    for (const unit of units) {
      await this.unitSchedule(unit, lastClosedMonth);
    }
  }

  /**
   * Сводка по всем преподавателям за месяц — GET /salary. TEACHER видит
   * только себя (сужение по id, как в TeacherAttendanceService.report).
   */
  async overview(query: SalaryOverviewQueryDto, actor: SessionUser) {
    const month = query.month && isValidMonth(query.month) ? query.month : monthKey(new Date());
    const teacherFilter = actor.role === "TEACHER" ? actor.id : undefined;

    const units = await this.loadUnits({ branchId: query.branchId, teacherId: teacherFilter });

    const schedules = await Promise.all(
      units.map(async (unit) => ({ unit, months: await this.unitSchedule(unit, month) }))
    );

    const teacherIds = [...new Set(units.map((unit) => unit.teacherId))];
    const payouts =
      teacherIds.length > 0
        ? await this.prisma.teacherPayout.findMany({
            where: { teacherId: { in: teacherIds }, deletedAt: null },
            select: { teacherId: true, amount: true, forMonth: true, paidAt: true },
          })
        : [];
    const paidByTeacher = new Map<string, number>();
    for (const payout of payouts) {
      if (payoutMonth(payout) > month) continue;
      paidByTeacher.set(payout.teacherId, (paidByTeacher.get(payout.teacherId) ?? 0) + payout.amount);
    }

    interface Row {
      teacherId: string;
      teacherName: string;
      groupsCount: number;
      unratedGroupsCount: number;
      studentsCount: number;
      base: number;
      accrued: number;
      accruedTotal: number;
      paidTotal: number;
      debt: number;
    }
    const rows = new Map<string, Row>();

    for (const { unit, months } of schedules) {
      const row = rows.get(unit.teacherId) ?? {
        teacherId: unit.teacherId,
        teacherName: unit.teacherName,
        groupsCount: 0,
        unratedGroupsCount: 0,
        studentsCount: 0,
        base: 0,
        accrued: 0,
        accruedTotal: 0,
        paidTotal: 0,
        debt: 0,
      };

      if (unit.groupId) row.groupsCount += 1;
      const current = months.find((item) => item.month === month);
      if (current) {
        row.studentsCount += current.accrual.studentsCount;
        row.base += current.accrual.base;
        row.accrued += current.accrual.amount;
        if (current.accrual.percentUsed === null) row.unratedGroupsCount += 1;
      }
      row.accruedTotal += totalAccrued(months);
      rows.set(unit.teacherId, row);
    }

    for (const row of rows.values()) {
      row.paidTotal = paidByTeacher.get(row.teacherId) ?? 0;
      row.debt = row.accruedTotal - row.paidTotal;
    }

    const result = [...rows.values()].sort((a, b) => b.debt - a.debt);
    return {
      month,
      rows: result,
      totals: {
        base: result.reduce((sum, row) => sum + row.base, 0),
        accrued: result.reduce((sum, row) => sum + row.accrued, 0),
        paid: result.reduce((sum, row) => sum + row.paidTotal, 0),
        debt: result.reduce((sum, row) => sum + row.debt, 0),
      },
    };
  }

  /**
   * Разбивка одного преподавателя по группам и месяцам — GET /salary/:teacherId
   * и GET /salary/me. Чужой teacherId для TEACHER — 404 (ответ не должен
   * подтверждать, что такой преподаватель существует).
   */
  async teacherDetail(teacherId: string, query: TeacherSalaryQueryDto, actor: SessionUser) {
    if (actor.role === "TEACHER" && actor.id !== teacherId) {
      throw new NotFoundException("teacherNotFound");
    }

    const teacher = await this.prismaService.prismaUnscoped.user.findUnique({
      where: { id: teacherId },
      select: { id: true, firstName: true, lastName: true, salaryPercentBp: true },
    });
    if (!teacher) throw new NotFoundException("teacherNotFound");

    const month = query.month && isValidMonth(query.month) ? query.month : monthKey(new Date());
    const units = await this.loadUnits({ teacherId });

    const groups = await Promise.all(
      units.map(async (unit) => {
        const monthAccruals = await this.unitSchedule(unit, month);
        const idByMonth = await this.accrualIds(unit);
        return {
          groupId: unit.groupId,
          groupName: unit.groupName,
          courseId: unit.courseId,
          courseTitle: unit.courseTitle,
          branchId: unit.branchId,
          groupPercentBp: unit.groupPercentBp,
          months: monthAccruals.map((item) => ({
            id: idByMonth.get(item.month) ?? null,
            month: item.month,
            base: item.accrual.base,
            studentsCount: item.accrual.studentsCount,
            percentUsed: item.accrual.percentUsed,
            amount: item.accrual.amount,
            isFormula: item.accrual.isFormula,
            locked: item.locked,
          })),
        };
      })
    );

    const payouts = await this.prisma.teacherPayout.findMany({
      where: { teacherId, deletedAt: null },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    const paidTotal = payouts
      .filter((payout) => payoutMonth(payout) <= month)
      .reduce((sum, payout) => sum + payout.amount, 0);
    const accruedTotal = groups.reduce(
      (sum, group) => sum + group.months.reduce((s, m) => s + m.amount, 0),
      0
    );

    return {
      teacher: {
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        salaryPercentBp: teacher.salaryPercentBp,
      },
      month,
      groups,
      accruedTotal,
      paidTotal,
      debt: accruedTotal - paidTotal,
      payouts: payouts.map((payout) => ({
        id: payout.id,
        amount: payout.amount,
        method: payout.method,
        paidAt: payout.paidAt.toISOString(),
        forMonth: payout.forMonth,
        comment: payout.comment,
        createdBy: `${payout.createdBy.lastName} ${payout.createdBy.firstName}`,
      })),
    };
  }

  /** id зафиксированных строк единицы по месяцам — для ссылок PATCH/пересчёта в интерфейсе. */
  private async accrualIds(unit: Pick<Unit, "teacherId" | "courseId" | "groupId">) {
    const rows = await this.prisma.teacherSalaryAccrual.findMany({
      where: { teacherId: unit.teacherId, courseId: unit.courseId, groupId: unit.groupId },
      select: { id: true, month: true },
    });
    return new Map(rows.map((row) => [row.month, row.id]));
  }

  /**
   * Ручная фиксация суммы вместо формулы (или снятие фиксации, manualAmount:
   * null). Действует только на уже зафиксированную (закрытую) строку —
   * открытый месяц строки ещё не имеет и считается формулой (план, 5.5–5.6).
   */
  async setManualAmount(accrualId: string, manualAmount: number | null, actor: SessionUser) {
    const existing = await this.prisma.teacherSalaryAccrual.findUnique({ where: { id: accrualId } });
    if (!existing) throw new NotFoundException("accrualNotFound");

    const updated = await this.prisma.teacherSalaryAccrual.update({
      where: { id: accrualId },
      data: { manualAmount },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "TeacherSalaryAccrual",
      entityId: accrualId,
      action: "UPDATE",
      changes: { manualAmount: { old: existing.manualAmount, new: manualAmount } },
      metadata: { teacherId: existing.teacherId, month: existing.month, groupId: existing.groupId },
    });

    return { amount: updated.manualAmount ?? updated.amount };
  }

  /**
   * Перезаписывает закрытый месяц по актуальной базе (число учеников и их
   * начисления могли измениться — например, пересчётом billing.recalculateMonth).
   *
   * Ставка, по которой считали (percentUsed), берётся ЗАФИКСИРОВАННАЯ, а не
   * текущая — ровно как priceUsed в billing.service.ts:446. Пересчёт
   * исправляет базу, но не переписывает ставку задним числом: иначе кнопка
   * стала бы обходом самой заморозки.
   */
  async recalculateMonth(teacherId: string, query: RecalcQueryDto, actor: SessionUser) {
    const { month, groupId } = query;
    if (!isValidMonth(month) || !isClosedMonth(month)) throw new BadRequestException("monthNotClosed");

    const resolvedGroupId = groupId ?? null;
    const units = await this.loadUnits({ teacherId, groupId: resolvedGroupId });
    const unit = units[0];
    if (!unit) throw new NotFoundException("unitNotFound");

    const stored = await this.prisma.teacherSalaryAccrual.findFirst({
      where: { teacherId: unit.teacherId, courseId: unit.courseId, groupId: unit.groupId, month },
    });
    if (!stored) throw new NotFoundException("accrualNotFound");

    const enrollments = await this.loadUnitEnrollments(unit);
    const schedules = await this.ledger.resolveSchedules(enrollments, month);

    let base = 0;
    let studentsCount = 0;
    for (const enrollment of enrollments) {
      const charge = (schedules.get(enrollment.id) ?? []).find((item) => item.month === month)?.charge;
      if (!charge) continue;
      base += charge.amount;
      if (charge.amount > 0) studentsCount += 1;
    }

    const nextAmount = computeFormulaAmount(base, stored.percentUsed);
    const changed = stored.base !== base || stored.studentsCount !== studentsCount || stored.amount !== nextAmount;

    if (!changed) return { amount: stored.manualAmount ?? stored.amount, changed: false };

    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          userId: actor.id,
          entityType: "TeacherSalaryAccrual",
          entityId: stored.id,
          action: "UPDATE",
          changes: {
            base: { old: stored.base, new: base },
            studentsCount: { old: stored.studentsCount, new: studentsCount },
            amount: { old: stored.amount, new: nextAmount },
          },
          metadata: { recalculated: true, teacherId, month, groupId: unit.groupId, percentUsed: stored.percentUsed },
        },
        tx
      );

      await tx.teacherSalaryAccrual.update({
        where: { id: stored.id },
        data: { base, studentsCount, amount: nextAmount, lockedAt: new Date() },
      });
    });

    return { amount: stored.manualAmount ?? nextAmount, changed: true };
  }
}
