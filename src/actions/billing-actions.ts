"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";
import { revalidateLocalized } from "@/lib/revalidate";
import {
  chargeForMonth,
  chargeSchedule,
  isValidMonth,
  monthKey,
  paymentMonth,
  type BillingEnrollment,
} from "@/lib/billing";
import {
  updateEnrollmentBillingSchema,
  type UpdateEnrollmentBillingInput,
} from "@/validators/billing";

/** Календарная дата "YYYY-MM-DD" → полдень UTC (см. payment-actions) */
function toNoonUtc(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

/**
 * Записи на платные курсы вместе со всем, что нужно для начисления.
 * Курсы без цены и удалённые отсеиваются на уровне запроса.
 */
async function loadBillableEnrollments(filters: {
  courseId?: string;
  groupId?: string;
  studentId?: string;
}) {
  return prisma.enrollment.findMany({
    where: {
      course: { deletedAt: null, price: { not: null } },
      student: { deletedAt: null },
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      startsAt: true,
      billingEndsAt: true,
      priceOverride: true,
      firstMonthCharge: true,
      studentId: true,
      courseId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          telegramUsername: true,
        },
      },
      course: { select: { id: true, title: true, price: true } },
      group: { select: { id: true, name: true, scheduleDays: true, endDate: true } },
    },
  });
}

type LoadedEnrollment = Awaited<ReturnType<typeof loadBillableEnrollments>>[number];

function toBillingEnrollment(enrollment: LoadedEnrollment): BillingEnrollment {
  return {
    startsAt: enrollment.startsAt,
    createdAt: enrollment.createdAt,
    billingEndsAt: enrollment.billingEndsAt,
    priceOverride: enrollment.priceOverride,
    firstMonthCharge: enrollment.firstMonthCharge,
    coursePrice: enrollment.course.price,
    scheduleDays: enrollment.group?.scheduleDays ?? [],
    groupEndDate: enrollment.group?.endDate ?? null,
  };
}

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

  return enrollments.map((enrollment) => {
    const schedule = chargeSchedule(toBillingEnrollment(enrollment), month);
    const charged = schedule.reduce((sum, item) => sum + item.charge.amount, 0);
    const paid = paidByEnrollment.get(`${enrollment.studentId}:${enrollment.courseId}`) ?? 0;

    return {
      enrollmentId: enrollment.id,
      student: enrollment.student,
      course: { id: enrollment.course.id, title: enrollment.course.title },
      group: enrollment.group ? { id: enrollment.group.id, name: enrollment.group.name } : null,
      monthlyPrice: enrollment.priceOverride ?? enrollment.course.price ?? 0,
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
          group: { select: { name: true, scheduleDays: true, endDate: true } },
        },
      });

      if (!enrollment) {
        return { success: true as const, data: null };
      }

      const start = enrollment.startsAt ?? enrollment.createdAt;
      const firstMonth = monthKey(start);
      // Считаем без ручной правки — чтобы показать, что предлагает формула
      const suggested = chargeForMonth(
        {
          startsAt: enrollment.startsAt,
          createdAt: enrollment.createdAt,
          billingEndsAt: enrollment.billingEndsAt,
          priceOverride: enrollment.priceOverride,
          firstMonthCharge: null,
          coursePrice: enrollment.course.price,
          scheduleDays: enrollment.group?.scheduleDays ?? [],
          groupEndDate: enrollment.group?.endDate ?? null,
        },
        firstMonth
      );

      return {
        success: true as const,
        data: {
          id: enrollment.id,
          studentName: `${enrollment.student.lastName} ${enrollment.student.firstName}`,
          courseTitle: enrollment.course.title,
          groupName: enrollment.group?.name ?? null,
          coursePrice: enrollment.course.price,
          startsAt: (enrollment.startsAt ?? enrollment.createdAt).toISOString(),
          startsAtExplicit: enrollment.startsAt !== null,
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
