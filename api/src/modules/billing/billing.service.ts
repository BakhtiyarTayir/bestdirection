import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingLedgerService, type LedgerFilters } from "./billing-ledger.service";
import {
  billingStart,
  chargeForMonth,
  isClosedMonth,
  isValidMonth,
  monthKey,
  paymentMonth,
  priceFor,
  type BillingEnrollment,
} from "./domain/billing";
import type { UpdateEnrollmentBillingDto } from "./dto/billing.dto";

/**
 * Начисления, должники и карточка студента. Перенесено из
 * src/actions/billing-actions.ts в web; расчёт и комментарии сохранены.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly ledger: BillingLedgerService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Начислено/оплачено по каждой записи на конец указанного месяца.
   * Долг накопительный: всё начисленное с начала обучения минус всё оплаченное
   * за те же месяцы. Именно накопительный, а не помесячный — студент,
   * пропустивший июнь и заплативший июль, остаётся должником.
   */
  private async computeBillingRows(month: string, filters: LedgerFilters = {}) {
    const [enrollments, payments] = await Promise.all([
      this.ledger.loadBillableEnrollments(filters),
      this.prisma.payment.findMany({
        where: { deletedAt: null },
        select: { studentId: true, courseId: true, amount: true, forMonth: true, paidAt: true },
      }),
    ]);

    // Оплаты за месяцы ПОЗЖЕ выбранного не гасят текущий долг — иначе аванс
    // за сентябрь скрыл бы неоплаченный июль
    const paidByEnrollment = new Map<string, number>();
    for (const payment of payments) {
      if (paymentMonth(payment) > month) continue;
      const key = `${payment.studentId}:${payment.courseId}`;
      paidByEnrollment.set(key, (paidByEnrollment.get(key) ?? 0) + payment.amount);
    }

    const schedules = await this.ledger.resolveSchedules(enrollments, month);

    return enrollments.map((enrollment) => {
      const schedule = schedules.get(enrollment.id) ?? [];
      const charged = schedule.reduce((sum, item) => sum + item.charge.amount, 0);
      const paid = paidByEnrollment.get(`${enrollment.studentId}:${enrollment.courseId}`) ?? 0;

      return {
        enrollmentId: enrollment.id,
        student: enrollment.student,
        course: { id: enrollment.course.id, title: enrollment.course.title },
        group: enrollment.group ? { id: enrollment.group.id, name: enrollment.group.name } : null,
        monthlyPrice: priceFor(this.ledger.toBillingEnrollment(enrollment)) ?? 0,
        hasSchedule: (enrollment.group?.scheduleDays.length ?? 0) > 0,
        // Две разные причины расчёта по дням: студента нет в группе или у
        // группы не заданы дни занятий. Совет админу в каждом случае свой.
        hasGroup: enrollment.group !== null,
        charged,
        paid,
        debt: charged - paid,
        billedMonths: schedule.filter((item) => item.charge.amount > 0).length,
        breakdown: schedule.map((item) => ({
          month: item.month,
          amount: item.charge.amount,
          basis: item.charge.basis,
          unitsTotal: item.charge.unitsTotal,
          unitsBilled: item.charge.unitsBilled,
        })),
      };
    });
  }

  async debtors(params: { month?: string; courseId?: string; groupId?: string; branchId?: string }) {
    const month = params.month && isValidMonth(params.month) ? params.month : monthKey(new Date());
    const rows = await this.computeBillingRows(month, {
      courseId: params.courseId,
      groupId: params.groupId,
      branchId: params.branchId,
    });

    const debtors = rows.filter((row) => row.debt > 0).sort((a, b) => b.debt - a.debt);
    const prepaid = rows.filter((row) => row.debt < 0);

    return {
      month,
      debtors,
      totalDebt: debtors.reduce((sum, row) => sum + row.debt, 0),
      prepaidCount: prepaid.length,
      prepaidTotal: prepaid.reduce((sum, row) => sum - row.debt, 0),
      // Неполный месяц у них считается по дням, а не по занятиям
      withoutGroup: rows.filter((row) => !row.hasGroup).length,
      groupWithoutSchedule: rows.filter((row) => row.hasGroup && !row.hasSchedule).length,
    };
  }

  /** Для бейджа в сайдбаре; считает по текущему месяцу. */
  async debtorsCount() {
    const rows = await this.computeBillingRows(monthKey(new Date()));
    return { count: rows.filter((row) => row.debt > 0).length };
  }

  /**
   * Карточка биллинга одной записи + подсказка по первому месяцу,
   * чтобы админ видел, из чего сложилась предлагаемая сумма.
   */
  async enrollmentBilling(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        createdAt: true,
        startsAt: true,
        billingEndsAt: true,
        priceOverride: true,
        firstMonthCharge: true,
        student: { select: { firstName: true, lastName: true } },
        course: { select: { title: true, price: true } },
        group: { select: { name: true, price: true, scheduleDays: true, startDate: true, endDate: true } },
      },
    });

    if (!enrollment) return null;

    const billing: BillingEnrollment = {
      startsAt: enrollment.startsAt,
      createdAt: enrollment.createdAt,
      billingEndsAt: enrollment.billingEndsAt,
      priceOverride: enrollment.priceOverride,
      firstMonthCharge: null,
      coursePrice: enrollment.course.price,
      groupPrice: enrollment.group?.price ?? null,
      scheduleDays: enrollment.group?.scheduleDays ?? [],
      groupEndDate: enrollment.group?.endDate ?? null,
      groupStartDate: enrollment.group?.startDate ?? null,
    };
    // Первый месяц — от фактического начала: оно может быть отложено датой
    // старта группы, и тогда подсказка должна считать именно тот месяц.
    const start = billingStart(billing);
    const firstMonth = monthKey(start);
    // Считаем без ручной правки — чтобы показать, что предлагает формула
    const suggested = chargeForMonth(billing, firstMonth);

    return {
      id: enrollment.id,
      studentName: `${enrollment.student.lastName} ${enrollment.student.firstName}`,
      courseTitle: enrollment.course.title,
      groupName: enrollment.group?.name ?? null,
      coursePrice: enrollment.course.price,
      groupPrice: enrollment.group?.price ?? null,
      // Форму заполняет ИМЕННО сохранённое значение: подставить сюда
      // фактическое начало (отложенное стартом группы) нельзя — админ,
      // зашедший поменять цену, молча переписал бы дату начала.
      startsAt: (enrollment.startsAt ?? enrollment.createdAt).toISOString(),
      startsAtExplicit: enrollment.startsAt !== null,
      // Фактическое начало — только для подсказки, в форму не идёт
      effectiveStartsAt: start.toISOString(),
      billingEndsAt: enrollment.billingEndsAt?.toISOString() ?? null,
      priceOverride: enrollment.priceOverride,
      firstMonthCharge: enrollment.firstMonthCharge,
      firstMonth,
      suggestedFirstMonthCharge: suggested.amount,
      suggestionBasis: suggested.basis,
      suggestionUnitsTotal: suggested.unitsTotal,
      suggestionUnitsBilled: suggested.unitsBilled,
      hasSchedule: (enrollment.group?.scheduleDays.length ?? 0) > 0,
    };
  }

  async updateEnrollmentBilling(
    enrollmentId: string,
    data: UpdateEnrollmentBillingDto,
    actor: SessionUser
  ) {
    const existing = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, startsAt: true, billingEndsAt: true, priceOverride: true, firstMonthCharge: true },
    });
    if (!existing) throw new NotFoundException("enrollmentNotFound");

    const { startsAt, billingEndsAt, priceOverride, firstMonthCharge } = data;
    if (startsAt && billingEndsAt && billingEndsAt < startsAt) {
      throw new BadRequestException("endBeforeStart");
    }

    // Закрытые месяцы окончательны, а заморозка ленивая: фиксируем их ДО
    // записи, иначе ещё не открытый месяц посчитался бы по новым настройкам
    await this.ledger.freezeClosedMonths({ enrollmentId });

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        // Пустая строка от формы = «очистить поле», отсюда явный null
        startsAt: startsAt ? toNoonUtc(startsAt) : null,
        billingEndsAt: billingEndsAt ? toNoonUtc(billingEndsAt) : null,
        priceOverride: priceOverride ?? null,
        firstMonthCharge: firstMonthCharge ?? null,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Enrollment",
      entityId: enrollmentId,
      action: "UPDATE",
      changes: {
        startsAt: { old: existing.startsAt, new: updated.startsAt },
        billingEndsAt: { old: existing.billingEndsAt, new: updated.billingEndsAt },
        priceOverride: { old: existing.priceOverride, new: updated.priceOverride },
        firstMonthCharge: { old: existing.firstMonthCharge, new: updated.firstMonthCharge },
      },
    });
  }

  /**
   * Карточка студента: по каждому курсу — помесячная история начислений и
   * оплат с балансом на конец месяца.
   */
  async studentBilling(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, phone: true, login: true, telegramUsername: true },
    });
    if (!student) throw new NotFoundException("userNotFound");

    const [enrollments, payments] = await Promise.all([
      this.ledger.loadBillableEnrollments({ studentId }),
      this.prisma.payment.findMany({
        where: { studentId, deletedAt: null },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          forMonth: true,
          comment: true,
          courseId: true,
          course: { select: { title: true } },
          group: { select: { name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    // Начисления считаем СТРОГО по текущий месяц — как в studentsOverview
    // (список должников на текущий месяц). Раньше расписание доводилось до
    // месяца последней оплаты по ВСЕМ курсам студента: аванс за декабрь по
    // курсу A дописывал курсу B начисления за октябрь-декабрь, которых там
    // ещё нет, — баланс карточки расходился со списком. Оплаты за будущие
    // месяцы всё равно попадают в таблицу строками (месяцы берутся из
    // объединения schedule и paidByMonth ниже), просто без начисления.
    const currentMonth = monthKey(new Date());

    const schedules = await this.ledger.resolveSchedules(enrollments, currentMonth);

    const courses = enrollments.map((enrollment) => {
      const schedule = schedules.get(enrollment.id) ?? [];

      const paidByMonth = new Map<string, number>();
      for (const payment of payments) {
        if (payment.courseId !== enrollment.courseId) continue;
        const month = paymentMonth(payment);
        paidByMonth.set(month, (paidByMonth.get(month) ?? 0) + payment.amount);
      }

      // Месяцы обеих сторон: начисления могут кончиться раньше оплат
      const months = Array.from(
        new Set([...schedule.map((item) => item.month), ...paidByMonth.keys()])
      ).sort();

      let running = 0;
      const rows = months.map((month) => {
        const charge = schedule.find((item) => item.month === month)?.charge;
        const charged = charge?.amount ?? 0;
        const paid = paidByMonth.get(month) ?? 0;
        running += paid - charged;
        return {
          month,
          charged,
          paid,
          basis: charge?.basis ?? "none",
          unitsTotal: charge?.unitsTotal ?? 0,
          unitsBilled: charge?.unitsBilled ?? 0,
          // Плюс — аванс, минус — долг на конец этого месяца
          balance: running,
          // Закрытый месяц с начислением лежит в реестре: resolveSchedules
          // выше заморозил его, если строки ещё не было
          locked: charge !== undefined && isClosedMonth(month),
        };
      });

      // Начисление за месяцы позже текущего всегда 0 (schedule до currentMonth
      // не доходит), а вот paid там может быть ненулевым — это аванс, и в
      // totalCharged/totalPaid/balance курса он не участвует, иначе баланс
      // карточки снова разошёлся бы со списком студентов
      const totalCharged = rows
        .filter((row) => row.month <= currentMonth)
        .reduce((sum, row) => sum + row.charged, 0);
      const totalPaid = rows
        .filter((row) => row.month <= currentMonth)
        .reduce((sum, row) => sum + row.paid, 0);
      const prepaidFuture = rows
        .filter((row) => row.month > currentMonth)
        .reduce((sum, row) => sum + row.paid, 0);
      const billing = this.ledger.toBillingEnrollment(enrollment);

      return {
        enrollmentId: enrollment.id,
        course: { id: enrollment.course.id, title: enrollment.course.title },
        group: enrollment.group ? { id: enrollment.group.id, name: enrollment.group.name } : null,
        monthlyPrice: priceFor(billing) ?? 0,
        hasSchedule: (enrollment.group?.scheduleDays.length ?? 0) > 0,
        startsAt: billingStart(billing).toISOString(),
        billingEndsAt: enrollment.billingEndsAt?.toISOString() ?? null,
        totalCharged,
        totalPaid,
        balance: totalPaid - totalCharged,
        // Аванс за месяцы позже текущего — отдельно от баланса (тот же приём,
        // что prepaidTotal в debtors(), только на уровне одного курса)
        prepaidFuture,
        months: rows,
      };
    });

    return {
      student,
      upToMonth: currentMonth,
      courses,
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        paidAt: payment.paidAt.toISOString(),
        forMonth: payment.forMonth,
        comment: payment.comment,
        courseTitle: payment.course.title,
        groupName: payment.group?.name ?? null,
        createdBy: `${payment.createdBy.lastName} ${payment.createdBy.firstName}`,
      })),
      totals: {
        charged: courses.reduce((sum, c) => sum + c.totalCharged, 0),
        paid: courses.reduce((sum, c) => sum + c.totalPaid, 0),
        balance: courses.reduce((sum, c) => sum + c.balance, 0),
        prepaidFuture: courses.reduce((sum, c) => sum + c.prepaidFuture, 0),
      },
    };
  }

  /**
   * Список всех студентов с балансом на текущий месяц. Нужен как вход в
   * карточку: список должников показывает только должников.
   */
  async studentsOverview(branchId?: string) {
    const [students, rows] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          role: "STUDENT",
          // Ученик может ходить на курсы в разных филиалах — фильтр смотрит
          // на его группы, а не на «основной» branchId (ловушка 3.8.5 плана
          // филиалов). Баланс ниже при этом считаем по ВСЕМ его курсам:
          // фильтр решает, кто попал в список, а не что показать про него.
          ...(branchId ? { enrollments: { some: { group: { is: { branchId } } } } } : {}),
        },
        orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          number: true,
          firstName: true,
          lastName: true,
          phone: true,
          login: true,
          isActive: true,
          branch: { select: { id: true, name: true } },
        },
      }),
      this.computeBillingRows(monthKey(new Date())),
    ]);

    const byStudent = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byStudent.get(row.student.id) ?? [];
      list.push(row);
      byStudent.set(row.student.id, list);
    }

    return students.map((student) => {
      const own = byStudent.get(student.id) ?? [];
      return {
        ...student,
        courses: own.map((row) => ({
          enrollmentId: row.enrollmentId,
          title: row.course.title,
          groupName: row.group?.name ?? null,
        })),
        // Плюс — аванс, минус — долг, как в карточке студента
        balance: own.reduce((sum, row) => sum - row.debt, 0),
      };
    });
  }

  /**
   * Закрытый месяц окончателен: правки в диалоге начислений его не трогают.
   * Исправить его можно только явно — предпросмотром и пересчётом.
   *
   * Цена берётся ЗАФИКСИРОВАННАЯ (priceUsed), а не текущая. Пересчёт исправляет
   * даты и число занятий, но цену месяца задним числом не меняет — иначе кнопка
   * стала бы обходом той самой фиксации.
   */
  private async computeRecalc(enrollmentId: string, month: string) {
    if (!isValidMonth(month) || !isClosedMonth(month)) throw new BadRequestException("monthNotClosed");

    const [enrollment] = await this.ledger.loadBillableEnrollments({ enrollmentId });
    if (!enrollment) throw new NotFoundException("enrollmentNotFound");

    const stored = await this.prisma.monthlyCharge.findUnique({
      where: { enrollmentId_month: { enrollmentId, month } },
    });
    if (!stored) throw new NotFoundException("chargeNotFound");

    const next = chargeForMonth(
      { ...this.ledger.toBillingEnrollment(enrollment), priceOverride: stored.priceUsed },
      month
    );
    const changed =
      stored.amount !== next.amount ||
      stored.basis !== next.basis ||
      stored.unitsTotal !== next.unitsTotal ||
      stored.unitsBilled !== next.unitsBilled;

    return { stored, next, changed };
  }

  /** Предпросмотр: что сейчас зафиксировано и что даст пересчёт */
  async previewMonthRecalc(enrollmentId: string, month: string) {
    const { stored, next, changed } = await this.computeRecalc(enrollmentId, month);
    return {
      month,
      priceUsed: stored.priceUsed,
      current: {
        amount: stored.amount,
        basis: stored.basis,
        unitsTotal: stored.unitsTotal,
        unitsBilled: stored.unitsBilled,
      },
      next: {
        amount: next.amount,
        basis: next.basis,
        unitsTotal: next.unitsTotal,
        unitsBilled: next.unitsBilled,
      },
      changed,
    };
  }

  /**
   * Перезаписывает закрытый месяц по актуальным данным записи.
   *
   * Журнал и изменение суммы идут одной транзакцией: это правка денег задним
   * числом, и она не должна пройти без следа.
   */
  async recalculateMonth(enrollmentId: string, month: string, actor: SessionUser) {
    const { stored, next, changed } = await this.computeRecalc(enrollmentId, month);

    // Нечего менять — не пишем в журнал пустую правку
    if (!changed) return { amount: stored.amount, changed: false };

    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          userId: actor.id,
          entityType: "MonthlyCharge",
          entityId: stored.id,
          action: "UPDATE",
          changes: {
            amount: { old: stored.amount, new: next.amount },
            basis: { old: stored.basis, new: next.basis },
            unitsTotal: { old: stored.unitsTotal, new: next.unitsTotal },
            unitsBilled: { old: stored.unitsBilled, new: next.unitsBilled },
          },
          metadata: { recalculated: true, enrollmentId, month, priceUsed: stored.priceUsed },
        },
        tx
      );

      await tx.monthlyCharge.update({
        where: { id: stored.id },
        data: {
          amount: next.amount,
          basis: next.basis,
          unitsTotal: next.unitsTotal,
          unitsBilled: next.unitsBilled,
          lockedAt: new Date(),
        },
      });
    });

    return { amount: next.amount, changed: true };
  }
}
