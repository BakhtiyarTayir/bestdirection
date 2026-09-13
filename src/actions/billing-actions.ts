"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";
import { revalidateLocalized } from "@/lib/revalidate";
import {
  billingStart,
  chargeForMonth,
  isClosedMonth,
  isValidMonth,
  monthKey,
  paymentMonth,
  priceFor,
  type BillingEnrollment,
} from "@/lib/billing";
import {
  freezeClosedMonths,
  loadBillableEnrollments,
  resolveSchedules,
  toBillingEnrollment,
} from "@/lib/billing-ledger";
import {
  updateEnrollmentBillingSchema,
  type UpdateEnrollmentBillingInput,
} from "@/validators/billing";
import { toNoonUtc } from "@/lib/date-only";

/**
 * Начислено/оплачено по каждой записи на конец указанного месяца.
 * Долг накопительный: всё начисленное с начала обучения минус всё оплаченное
 * за те же месяцы. Именно накопительный, а не помесячный — студент,
 * пропустивший июнь и заплативший июль, остаётся должником.
 */
async function computeBillingRows(
  month: string,
  filters: { courseId?: string; groupId?: string } = {}
) {
  const [enrollments, payments] = await Promise.all([
    loadBillableEnrollments(filters),
    prisma.payment.findMany({
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

  const schedules = await resolveSchedules(enrollments, month);

  return enrollments.map((enrollment) => {
    const schedule = schedules.get(enrollment.id) ?? [];
    const charged = schedule.reduce((sum, item) => sum + item.charge.amount, 0);
    const paid = paidByEnrollment.get(`${enrollment.studentId}:${enrollment.courseId}`) ?? 0;

    return {
      enrollmentId: enrollment.id,
      student: enrollment.student,
      course: { id: enrollment.course.id, title: enrollment.course.title },
      group: enrollment.group ? { id: enrollment.group.id, name: enrollment.group.name } : null,
      monthlyPrice: priceFor(toBillingEnrollment(enrollment)) ?? 0,
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

// ---------- getDebtors (ADMIN) ----------
export async function getDebtors(params: { month?: string; courseId?: string; groupId?: string } = {}) {
  return withAuth(
    async () => {
      const month =
        params.month && isValidMonth(params.month) ? params.month : monthKey(new Date());

      const rows = await computeBillingRows(month, {
        courseId: params.courseId,
        groupId: params.groupId,
      });

      const debtors = rows
        .filter((row) => row.debt > 0)
        .sort((a, b) => b.debt - a.debt);
      const prepaid = rows.filter((row) => row.debt < 0);

      return {
        success: true as const,
        data: {
          month,
          debtors,
          totalDebt: debtors.reduce((sum, row) => sum + row.debt, 0),
          prepaidCount: prepaid.length,
          prepaidTotal: prepaid.reduce((sum, row) => sum - row.debt, 0),
          // Неполный месяц у них считается по дням, а не по занятиям
          withoutGroup: rows.filter((row) => !row.hasGroup).length,
          groupWithoutSchedule: rows.filter(
            (row) => row.hasGroup && !row.hasSchedule
          ).length,
        },
      };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getDebtorsCount (ADMIN) ----------
// Для бейджа в сайдбаре; считает по текущему месяцу.
export async function getDebtorsCount() {
  return withAuth(
    async () => {
      const rows = await computeBillingRows(monthKey(new Date()));
      const count = rows.filter((row) => row.debt > 0).length;
      return { success: true as const, data: { count } };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getEnrollmentBilling (ADMIN) ----------
// Карточка биллинга одной записи + подсказка по первому месяцу,
// чтобы админ видел, из чего сложилась предлагаемая сумма.
export async function getEnrollmentBilling(enrollmentId: string) {
  return withAuth(
    async () => {
      const enrollment = await prisma.enrollment.findUnique({
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
          group: {
            select: {
              name: true,
              price: true,
              scheduleDays: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      });

      if (!enrollment) {
        return { success: true as const, data: null };
      }

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
        success: true as const,
        data: {
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
        },
      };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- updateEnrollmentBilling (ADMIN) ----------
export async function updateEnrollmentBilling(
  enrollmentId: string,
  input: UpdateEnrollmentBillingInput
) {
  return withAuth(
    async (session) => {
      const parsed = updateEnrollmentBillingSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false as const, error: "invalidInput" };
      }
      const { startsAt, billingEndsAt, priceOverride, firstMonthCharge } = parsed.data;

      const existing = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          id: true,
          startsAt: true,
          billingEndsAt: true,
          priceOverride: true,
          firstMonthCharge: true,
        },
      });
      if (!existing) {
        return { success: false as const, error: "enrollmentNotFound" };
      }

      if (startsAt && billingEndsAt && billingEndsAt < startsAt) {
        return { success: false as const, error: "endBeforeStart" };
      }

      // Закрытые месяцы окончательны, а заморозка ленивая: фиксируем их ДО
      // записи, иначе ещё не открытый месяц посчитался бы по новым настройкам
      await freezeClosedMonths({ enrollmentId });

      const updated = await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          // Пустая строка от формы = «очистить поле», отсюда явный null
          startsAt: startsAt ? toNoonUtc(startsAt) : null,
          billingEndsAt: billingEndsAt ? toNoonUtc(billingEndsAt) : null,
          priceOverride: priceOverride ?? null,
          firstMonthCharge: firstMonthCharge ?? null,
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Enrollment",
        entityId: enrollmentId,
        action: "UPDATE",
        changes: {
          startsAt: { old: existing.startsAt, new: updated.startsAt },
          billingEndsAt: { old: existing.billingEndsAt, new: updated.billingEndsAt },
          priceOverride: { old: existing.priceOverride, new: updated.priceOverride },
          firstMonthCharge: {
            old: existing.firstMonthCharge,
            new: updated.firstMonthCharge,
          },
        },
      });

      revalidateLocalized("/payments/debtors");
      revalidateLocalized("/payments");
      return { success: true as const };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getStudentBilling (ADMIN) ----------
/**
 * Карточка студента: по каждому курсу — помесячная история начислений и
 * оплат с балансом на конец месяца. Список должников показывает только тех,
 * у кого долг положительный, поэтому переплата там видна лишь общей суммой,
 * без имён. Здесь видно, откуда взялась каждая цифра.
 */
export async function getStudentBilling(studentId: string) {
  return withAuth(
    async () => {
      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          telegramUsername: true,
        },
      });
      if (!student) return { success: false as const, error: "userNotFound" };

      const [enrollments, payments] = await Promise.all([
        loadBillableEnrollments({ studentId }),
        prisma.payment.findMany({
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

      // История доводится до текущего месяца или до месяца последней оплаты —
      // иначе аванс за будущий месяц не попал бы в таблицу вовсе.
      const currentMonth = monthKey(new Date());
      const lastPaymentMonth = payments.reduce(
        (latest, payment) => {
          const month = paymentMonth(payment);
          return month > latest ? month : latest;
        },
        currentMonth
      );

      const schedules = await resolveSchedules(enrollments, lastPaymentMonth);

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

        const totalCharged = rows.reduce((sum, row) => sum + row.charged, 0);
        const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);

        return {
          enrollmentId: enrollment.id,
          course: { id: enrollment.course.id, title: enrollment.course.title },
          group: enrollment.group
            ? { id: enrollment.group.id, name: enrollment.group.name }
            : null,
          monthlyPrice: priceFor(toBillingEnrollment(enrollment)) ?? 0,
          hasSchedule: (enrollment.group?.scheduleDays.length ?? 0) > 0,
          startsAt: billingStart(toBillingEnrollment(enrollment)).toISOString(),
          billingEndsAt: enrollment.billingEndsAt?.toISOString() ?? null,
          totalCharged,
          totalPaid,
          balance: totalPaid - totalCharged,
          months: rows,
        };
      });

      return {
        success: true as const,
        data: {
          student,
          upToMonth: lastPaymentMonth,
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
          },
        },
      };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getStudentsOverview (ADMIN) ----------
/**
 * Список всех студентов с балансом на текущий месяц. Нужен как вход в
 * карточку: список должников показывает только должников, и, поправив
 * студенту дату начала, вернуться к его настройкам было уже неоткуда.
 */
export async function getStudentsOverview() {
  return withAuth(
    async () => {
      const [students, rows] = await Promise.all([
        prisma.user.findMany({
          where: { role: "STUDENT", deletedAt: null },
          orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            number: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            isActive: true,
          },
        }),
        computeBillingRows(monthKey(new Date())),
      ]);

      const byStudent = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = byStudent.get(row.student.id) ?? [];
        list.push(row);
        byStudent.set(row.student.id, list);
      }

      return {
        success: true as const,
        data: students.map((student) => {
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
        }),
      };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- пересчёт закрытого месяца (ADMIN) ----------

/**
 * Закрытый месяц окончателен: правки в диалоге начислений его не трогают.
 * Исправить его можно только явно — этой парой действий.
 *
 * Цена берётся ЗАФИКСИРОВАННАЯ (priceUsed), а не текущая. Пересчёт исправляет
 * даты и число занятий, но цену месяца задним числом не меняет — иначе кнопка
 * стала бы обходом той самой фиксации: поправили в сентябре дату начала, а
 * сентябрь заодно подтянул октябрьскую цену.
 */
async function computeRecalc(enrollmentId: string, month: string) {
  if (!isValidMonth(month) || !isClosedMonth(month)) {
    return { ok: false as const, error: "monthNotClosed" };
  }

  const [enrollment] = await loadBillableEnrollments({ enrollmentId });
  if (!enrollment) {
    return { ok: false as const, error: "enrollmentNotFound" };
  }

  const stored = await prisma.monthlyCharge.findUnique({
    where: { enrollmentId_month: { enrollmentId, month } },
  });
  if (!stored) {
    return { ok: false as const, error: "chargeNotFound" };
  }

  const next = chargeForMonth(
    { ...toBillingEnrollment(enrollment), priceOverride: stored.priceUsed },
    month
  );
  const changed =
    stored.amount !== next.amount ||
    stored.basis !== next.basis ||
    stored.unitsTotal !== next.unitsTotal ||
    stored.unitsBilled !== next.unitsBilled;

  return { ok: true as const, stored, next, changed };
}

/** Предпросмотр: что сейчас зафиксировано и что даст пересчёт */
export async function previewMonthRecalc(enrollmentId: string, month: string) {
  return withAuth(
    async () => {
      const result = await computeRecalc(enrollmentId, month);
      if (!result.ok) {
        return { success: false as const, error: result.error };
      }
      const { stored, next, changed } = result;

      return {
        success: true as const,
        data: {
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
        },
      };
    },
    { roles: ["ADMIN"] }
  );
}

/**
 * Перезаписывает закрытый месяц по актуальным данным записи.
 *
 * Журнал и изменение суммы идут одной транзакцией: это правка денег задним
 * числом, и она не должна пройти без следа. createAuditLog здесь не годится —
 * он глотает ошибку, и сумма поменялась бы при незаписанном журнале.
 */
export async function recalculateMonth(enrollmentId: string, month: string) {
  return withAuth(
    async (session) => {
      const result = await computeRecalc(enrollmentId, month);
      if (!result.ok) {
        return { success: false as const, error: result.error };
      }
      const { stored, next, changed } = result;

      // Нечего менять — не пишем в журнал пустую правку
      if (!changed) {
        return { success: true as const, data: { amount: stored.amount, changed: false } };
      }

      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            entityType: "MonthlyCharge",
            entityId: stored.id,
            action: "UPDATE",
            changes: {
              amount: { old: stored.amount, new: next.amount },
              basis: { old: stored.basis, new: next.basis },
              unitsTotal: { old: stored.unitsTotal, new: next.unitsTotal },
              unitsBilled: { old: stored.unitsBilled, new: next.unitsBilled },
            },
            metadata: {
              recalculated: true,
              enrollmentId,
              month,
              priceUsed: stored.priceUsed,
            },
          },
        });

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

      revalidateLocalized("/payments/debtors");
      revalidateLocalized("/payments");
      return { success: true as const, data: { amount: next.amount, changed: true } };
    },
    { roles: ["ADMIN"] }
  );
}
