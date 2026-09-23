import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  addMonths,
  chargeSchedule,
  isClosedMonth,
  mergeSchedule,
  currentMonthKey,
  priceFor,
  type BillingEnrollment,
  type ChargeBasis,
  type MonthCharge,
  type StoredCharge,
} from "./domain/billing";

/**
 * Prisma-фильтр «запись НЕ отчислена» — им пользуются списки и проверки
 * доступа, которым не всё равно, считается ли ученик ещё учащимся курса
 * (состав группы, «ученики курса», доступ к материалам, самозапись).
 *
 * Источник истины — Enrollment.unenrolledAt, а не связка groupId+billingEndsAt:
 * пауза (billingEndsAt проставлен через диалог должников) группу не снимает и
 * отчислением не считается — она останавливает только начисления, это уже
 * делает chargeForMonth сама по billingEndsAt, — а «без группы» само по себе
 * означает лишь ученика, ожидающего новую группу (активное состояние).
 */
export function activeEnrollmentFilter(): Prisma.EnrollmentWhereInput {
  return { unenrolledAt: null };
}

/** Более ранняя из двух дат; null — даты нет */
function earliestDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Prisma-фильтр «чья запись» для фильтра по преподавателю. Лестница одна на
 * весь проект (attendance-access.ts responsibleTeacherId, salary.service.ts
 * loadUnits): педагог группы, а если у группы педагог не задан или группы
 * нет — педагог курса. Единственное место, где она собрана в Prisma-условие,
 * — иначе фильтр должников и фильтр оплат со временем разъехались бы.
 */
export function enrollmentTeacherFilter(teacherId: string): Prisma.EnrollmentWhereInput {
  return {
    OR: [
      { group: { is: { teacherId } } },
      { group: { is: { teacherId: null } }, course: { teacherId } },
      { groupId: null, course: { teacherId } },
    ],
  };
}

/**
 * Тот же приём для Payment: группа берётся ИЗ ПЛАТЕЖА (снимок на момент
 * приёма денег), а не текущая группа ученика — перевод студента в другую
 * группу не должен задним числом менять кассу закрытого месяца.
 */
export function paymentTeacherFilter(teacherId: string): Prisma.PaymentWhereInput {
  return {
    OR: [
      { group: { is: { teacherId } } },
      { group: { is: { teacherId: null } }, course: { teacherId } },
      { groupId: null, course: { teacherId } },
    ],
  };
}

export interface LedgerFilters {
  enrollmentId?: string;
  courseId?: string;
  groupId?: string;
  studentId?: string;
  // У Enrollment своего филиала нет (ловушка 3.8.3 плана филиалов): фильтр
  // идёт через группу, а записи без группы при этом фильтре не попадают —
  // это решает вызывающий код (withoutGroup в счётчиках должников)
  branchId?: string;
  // Педагог записи — enrollmentTeacherFilter выше
  teacherId?: string;
}

/**
 * Реестр начислений: загрузка платных записей, наложение MonthlyCharge и
 * заморозка закрытых месяцев. Перенесено из src/lib/billing-ledger.ts в web;
 * логика и комментарии сохранены, изменился только источник клиента Prisma.
 */
@Injectable()
export class BillingLedgerService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Записи вместе со всем, что нужно для начисления. Удалённые студенты
   * отсеиваются, а курсы в Корзине — нет (решение владельца 2026-09-23): долг
   * ученика не исчезает оттого, что курс убрали. Новых начислений по такому
   * курсу нет — дата переноса в Корзину работает как дата окончания
   * (toBillingEnrollment).
   *
   * По умолчанию — только платные: цена есть у группы или у самого студента,
   * либо у записи уже зафиксирован ненулевой долг. Последнее условие
   * держит в расчёте запись, которая перестала быть платной (цену группы убрали,
   * группу удалили): иначе её замороженный долг лежал бы в базе, но пропал бы из
   * должников, карточки студента и пересчёта. Именно ненулевой — заморозка
   * фиксирует нулями и бесплатные записи, и они не должны лезть в расчёты.
   *
   * includeFree нужен заморозке перед записью: бесплатную запись надо
   * зафиксировать нулями ДО того, как она станет платной, — иначе все её
   * прошлые месяцы замёрзли бы уже по новой цене.
   */
  loadBillableEnrollments(filters: LedgerFilters, options: { includeFree?: boolean } = {}) {
    // Условия собираются в массив, а не разворачиваются спредом в один
    // объект: и платность (OR), и фильтр по преподавателю (тоже OR) не
    // могут ужиться в одном объекте — второй спред тихо перезаписал бы
    // первый. AND с массивом условий этого не допускает.
    return this.prisma.enrollment.findMany({
      where: {
        AND: [
          // Курсы в Корзине не отсеиваются — см. комментарий выше
          { student: { deletedAt: null } },
          ...(options.includeFree
            ? []
            : [
                {
                  OR: [
                    { group: { price: { not: null } } },
                    { priceOverride: { not: null } },
                    { monthlyCharges: { some: { amount: { gt: 0 } } } },
                  ],
                },
              ]),
          ...(filters.enrollmentId ? [{ id: filters.enrollmentId }] : []),
          ...(filters.courseId ? [{ courseId: filters.courseId }] : []),
          ...(filters.groupId ? [{ groupId: filters.groupId }] : []),
          ...(filters.studentId ? [{ studentId: filters.studentId }] : []),
          ...(filters.branchId ? [{ group: { is: { branchId: filters.branchId } } }] : []),
          ...(filters.teacherId ? [enrollmentTeacherFilter(filters.teacherId)] : []),
        ],
      },
      select: {
        id: true,
        createdAt: true,
        startsAt: true,
        billingEndsAt: true,
        unenrolledAt: true,
        priceOverride: true,
        firstMonthCharge: true,
        studentId: true,
        courseId: true,
        student: {
          select: { id: true, firstName: true, lastName: true, phone: true, telegramUsername: true },
        },
        course: { select: { id: true, title: true, deletedAt: true } },
        group: {
          select: { id: true, name: true, price: true, scheduleDays: true, startDate: true, endDate: true },
        },
      },
    });
  }

  toBillingEnrollment(enrollment: LoadedEnrollment): BillingEnrollment {
    return {
      startsAt: enrollment.startsAt,
      createdAt: enrollment.createdAt,
      // Курс в Корзине начисляет не дольше дня переноса туда
      billingEndsAt: earliestDate(enrollment.billingEndsAt, enrollment.course.deletedAt),
      priceOverride: enrollment.priceOverride,
      firstMonthCharge: enrollment.firstMonthCharge,
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
  async resolveSchedules(
    enrollments: LoadedEnrollment[],
    upToMonth: string
  ): Promise<Map<string, MonthCharge[]>> {
    const ids = enrollments.map((enrollment) => enrollment.id);
    const storedRows =
      ids.length > 0
        ? await this.prisma.monthlyCharge.findMany({
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
      const billing = this.toBillingEnrollment(enrollment);
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
          // Снимок группы для базы зарплаты. Текущая группа здесь и есть
          // группа закрытого месяца: каждый перевод сначала замораживает
          // закрытые месяцы (freezeClosedMonths) и только потом меняет groupId
          groupId: enrollment.group?.id ?? null,
          lockedAt: now,
        });
      }

      schedules.set(enrollment.id, mergeSchedule(computed, stored, now));
    }

    if (toFreeze.length > 0) {
      await this.prisma.monthlyCharge.createMany({ data: toFreeze, skipDuplicates: true });
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
  async freezeClosedMonths(filters: LedgerFilters) {
    const enrollments = await this.loadBillableEnrollments(filters, { includeFree: true });
    if (enrollments.length === 0) return;

    // Последний закрытый месяц — предыдущий: текущий ещё открыт
    const lastClosedMonth = addMonths(currentMonthKey(), -1);
    await this.resolveSchedules(enrollments, lastClosedMonth);
  }
}

export type LoadedEnrollment = Awaited<ReturnType<BillingLedgerService["loadBillableEnrollments"]>>[number];
