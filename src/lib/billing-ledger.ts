import { prisma } from "@/lib/prisma";
import {
  addMonths,
  chargeSchedule,
  isClosedMonth,
  mergeSchedule,
  monthKey,
  priceFor,
  type BillingEnrollment,
  type ChargeBasis,
  type MonthCharge,
  type StoredCharge,
} from "@/lib/billing";
import type { Prisma } from "@/generated/prisma";

/**
 * Реестр начислений: загрузка платных записей, наложение MonthlyCharge и
 * заморозка закрытых месяцев.
 *
 * Обычный серверный модуль, а не "use server": любая экспортированная функция
 * в файле с этой директивой становится публичным серверным действием, и
 * freezeClosedMonths без проверки прав оказалась бы открытым эндпоинтом.
 * Права проверяют вызывающие действия.
 */

/**
 * Записи вместе со всем, что нужно для начисления. Удалённые курсы и студенты
 * отсеиваются.
 *
 * По умолчанию — только платные: цена есть у курса, у группы или у самого
 * студента, либо у записи уже зафиксирован ненулевой долг. Последнее условие
 * держит в расчёте запись, которая перестала быть платной (цену группы убрали,
 * группу удалили): иначе её замороженный долг лежал бы в базе, но пропал бы из
 * должников, карточки студента и пересчёта. Именно ненулевой — заморозка
 * фиксирует нулями и бесплатные записи, и они не должны лезть в расчёты.
 *
 * includeFree нужен заморозке перед записью: бесплатную запись надо
 * зафиксировать нулями ДО того, как она станет платной, — иначе все её
 * прошлые месяцы замёрзли бы уже по новой цене.
 */
export async function loadBillableEnrollments(
  filters: {
    enrollmentId?: string;
    courseId?: string;
    groupId?: string;
    studentId?: string;
  },
  options: { includeFree?: boolean } = {}
) {
  return prisma.enrollment.findMany({
    where: {
      course: { deletedAt: null },
      student: { deletedAt: null },
      ...(options.includeFree
        ? {}
        : {
            OR: [
              { course: { price: { not: null } } },
              { group: { price: { not: null } } },
              { priceOverride: { not: null } },
              { monthlyCharges: { some: { amount: { gt: 0 } } } },
            ],
          }),
      ...(filters.enrollmentId ? { id: filters.enrollmentId } : {}),
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
      group: {
        select: {
          id: true,
          name: true,
          price: true,
          scheduleDays: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });
}

export type LoadedEnrollment = Awaited<ReturnType<typeof loadBillableEnrollments>>[number];

export function toBillingEnrollment(enrollment: LoadedEnrollment): BillingEnrollment {
  return {
    startsAt: enrollment.startsAt,
    createdAt: enrollment.createdAt,
    billingEndsAt: enrollment.billingEndsAt,
    priceOverride: enrollment.priceOverride,
    firstMonthCharge: enrollment.firstMonthCharge,
    coursePrice: enrollment.course.price,
    groupPrice: enrollment.group?.price ?? null,
    scheduleDays: enrollment.group?.scheduleDays ?? [],
    groupEndDate: enrollment.group?.endDate ?? null,
    groupStartDate: enrollment.group?.startDate ?? null,
  };
}

/**
 * Расписание начислений по записям с учётом реестра MonthlyCharge.
 *
 * Закрытые месяцы берутся из реестра, открытые считаются формулой. Закрытый
 * месяц, у которого строки ещё нет, фиксируется тут же — поэтому крон не нужен:
 * месяц замораживается при первом обращении после того, как закончился.
 * Повторные и параллельные вызовы безопасны: уникальный индекс
 * (enrollmentId, month) плюс skipDuplicates.
 */
export async function resolveSchedules(
  enrollments: LoadedEnrollment[],
  upToMonth: string
): Promise<Map<string, MonthCharge[]>> {
  const ids = enrollments.map((enrollment) => enrollment.id);
  const storedRows =
    ids.length > 0
      ? await prisma.monthlyCharge.findMany({
          where: { enrollmentId: { in: ids }, lockedAt: { not: null } },
          select: {
            enrollmentId: true,
            month: true,
            amount: true,
            basis: true,
            unitsTotal: true,
            unitsBilled: true,
          },
        })
      : [];

  const storedByEnrollment = new Map<string, StoredCharge[]>();
  for (const row of storedRows) {
    // Месяцы позже отчётного не участвуют: иначе замороженный август
    // попал бы в отчёт «на конец июля»
    if (row.month > upToMonth) continue;
    const list = storedByEnrollment.get(row.enrollmentId) ?? [];
    list.push({
      month: row.month,
      amount: row.amount,
      basis: row.basis as ChargeBasis,
      unitsTotal: row.unitsTotal,
      unitsBilled: row.unitsBilled,
    });
    storedByEnrollment.set(row.enrollmentId, list);
  }

  const now = new Date();
  const toFreeze: Prisma.MonthlyChargeCreateManyInput[] = [];
  const schedules = new Map<string, MonthCharge[]>();

  for (const enrollment of enrollments) {
    const billing = toBillingEnrollment(enrollment);
    const stored = storedByEnrollment.get(enrollment.id) ?? [];
    const storedMonths = new Set(stored.map((item) => item.month));
    const computed = chargeSchedule(billing, upToMonth);

    for (const item of computed) {
      if (!isClosedMonth(item.month, now) || storedMonths.has(item.month)) continue;
      toFreeze.push({
        enrollmentId: enrollment.id,
        month: item.month,
        amount: item.charge.amount,
        basis: item.charge.basis,
        unitsTotal: item.charge.unitsTotal,
        unitsBilled: item.charge.unitsBilled,
        priceUsed: priceFor(billing) ?? 0,
        lockedAt: now,
      });
    }

    schedules.set(enrollment.id, mergeSchedule(computed, stored, now));
  }

  if (toFreeze.length > 0) {
    await prisma.monthlyCharge.createMany({ data: toFreeze, skipDuplicates: true });
  }

  return schedules;
}

/**
 * Фиксирует закрытые месяцы затронутых записей ПЕРЕД изменением входов
 * начисления — цены, дат, расписания или группы.
 *
 * Заморозка ленивая: месяц фиксируется при первом просмотре после конца.
 * Без этого вызова сентябрь, который никто ещё не открывал, заморозился бы
 * уже по новой цене — ровно то, от чего защищает реестр. Идемпотентно:
 * уже замороженные месяцы не трогаются.
 *
 * Бесплатные записи тоже: их закрытые месяцы фиксируются нулями, иначе запись,
 * ставшая платной, получила бы долг за всё прошлое по новой цене.
 */
export async function freezeClosedMonths(filters: {
  enrollmentId?: string;
  courseId?: string;
  groupId?: string;
  studentId?: string;
}) {
  const enrollments = await loadBillableEnrollments(filters, { includeFree: true });
  if (enrollments.length === 0) return;

  // Последний закрытый месяц — предыдущий: текущий ещё открыт
  const lastClosedMonth = addMonths(monthKey(new Date()), -1);
  await resolveSchedules(enrollments, lastClosedMonth);
}
