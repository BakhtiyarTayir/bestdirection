import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import { paymentTeacherFilter } from "./billing-ledger.service";
import { priceFor } from "./domain/billing";
import { studentSearchWhere } from "./domain/student-search";
import type { CreatePaymentDto, PaymentFiltersDto } from "./dto/billing.dto";

/** Границы календарного месяца "YYYY-MM" в UTC: [начало, начало следующего) */
function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(year, monthNumber - 1, 1)), lt: new Date(Date.UTC(year, monthNumber, 1)) };
}

/** Потолок строк в журнале: итог (total, count) считается по всем, список обрезается — клиент показывает предупреждение */
export const PAYMENTS_LIST_LIMIT = 500;

/** Журнал оплат. Перенесено из src/actions/payment-actions.ts в web. */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /**
   * Журнал оплат с фильтрами. month по умолчанию (monthBy=paid) фильтрует по
   * дате приёма денег (касса за месяц), а не по периоду forMonth. При
   * monthBy=for — по периоду платежа, как paymentMonth() в domain/billing.ts:
   * forMonth = month ИЛИ (forMonth не задан И paidAt в этом месяце). Итог
   * (total, count) считается с тем же where.
   */
  async list(filters: PaymentFiltersDto) {
    const { month, monthBy, courseId, groupId, studentId, method, branchId, teacherId, q } = filters;
    const where = {
      deletedAt: null,
      ...(month && monthBy !== "for" ? { paidAt: monthRange(month) } : {}),
      // В AND, а не OR верхнего уровня: teacherId ниже тоже кладёт туда OR
      // Поиск ученика кладём туда же: слова — отдельные условия AND
      AND: [
        ...(month && monthBy === "for"
          ? [{ OR: [{ forMonth: month }, { forMonth: null, paidAt: monthRange(month) }] }]
          : []),
        ...studentSearchWhere(q).map((condition) => ({ student: condition })),
      ],
      ...(courseId ? { courseId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(method ? { method } : {}),
      // Снимок на платеже, а не через группу: касса за закрытый месяц не
      // должна дрожать от перевода или удаления группы
      ...(branchId ? { branchId } : {}),
      // Группа платежа (тот же снимок) — не текущая группа ученика
      ...(teacherId ? paymentTeacherFilter(teacherId) : {}),
    };

    const [payments, totals] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, phone: true } },
          course: { select: { id: true, title: true } },
          group: { select: { id: true, name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: PAYMENTS_LIST_LIMIT,
      }),
      this.prisma.payment.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);

    return { payments, total: totals._sum.amount ?? 0, count: totals._count, limit: PAYMENTS_LIST_LIMIT };
  }

  /**
   * Студенты с их записями на курсы: выбор студента в форме сразу подставляет
   * доступные курсы, группу и цену, без второго round-trip.
   */
  async formOptions() {
    const students = await this.prisma.user.findMany({
      where: { role: "STUDENT", enrollments: { some: {} } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        enrollments: {
          where: { course: { deletedAt: null } },
          select: {
            courseId: true,
            course: { select: { title: true } },
            groupId: true,
            group: { select: { name: true, price: true } },
            priceOverride: true,
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const courses = await this.prisma.course.findMany({
      where: { enrollments: { some: {} } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    });

    return {
      students: students.map((student) => ({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        enrollments: student.enrollments.map((enrollment) => ({
          courseId: enrollment.courseId,
          courseTitle: enrollment.course.title,
          // Действующая цена — priceOverride → цена группы (priceFor, единое
          // правило биллинга; цена курса в начислениях не участвует)
          price: priceFor({
            startsAt: null,
            createdAt: new Date(0),
            billingEndsAt: null,
            priceOverride: enrollment.priceOverride,
            firstMonthCharge: null,
            groupPrice: enrollment.group?.price ?? null,
            scheduleDays: [],
            groupEndDate: null,
            groupStartDate: null,
          }),
          groupId: enrollment.groupId,
          groupName: enrollment.group?.name ?? null,
        })),
      })),
      courses,
    };
  }

  async create(data: CreatePaymentDto, actor: SessionUser) {
    // Оплату принимаем только по существующей записи на курс — иначе платёж
    // повиснет вне группы и не попадёт в расчёт задолженности.
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: data.studentId, courseId: data.courseId } },
      select: { groupId: true },
    });
    if (!enrollment) throw new NotFoundException("notEnrolled");

    // Группа платежа — всегда группа записи студента. Клиент может прислать
    // groupId только для сверки; любая другая группа (даже того же курса)
    // записала бы платёж на чужую группу и чужой филиал (branchId ниже
    // берётся из группы) — отказ.
    if (data.groupId && data.groupId !== enrollment.groupId) throw new BadRequestException("groupMismatch");
    const groupId = enrollment.groupId;
    // Филиал — снимок на момент приёма денег (раздел 3.3 плана филиалов):
    // группу могут потом перевести или удалить, а касса за закрытый месяц
    // меняться не должна. Группа есть — берём её филиал, иначе филиал ученика.
    const branchId = groupId
      ? (await this.prisma.group.findUnique({ where: { id: groupId }, select: { branchId: true } }))?.branchId ?? null
      : (await this.prisma.user.findUnique({ where: { id: data.studentId }, select: { branchId: true } }))
          ?.branchId ?? null;

    const payment = await this.prisma.payment.create({
      data: {
        studentId: data.studentId,
        courseId: data.courseId,
        groupId,
        branchId,
        amount: data.amount,
        method: data.method,
        paidAt: toNoonUtc(data.paidAt),
        forMonth: data.forMonth,
        comment: data.comment?.trim() || null,
        createdById: actor.id,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "Payment",
      entityId: payment.id,
      action: "CREATE",
      metadata: {
        studentId: data.studentId,
        courseId: data.courseId,
        amount: data.amount,
        method: data.method,
        forMonth: data.forMonth ?? null,
      },
    });

    return { id: payment.id };
  }

  /** Serialized with refund creation on the same enrollment row. */
  async remove(id: string, actor: SessionUser) {
    return this.prismaService.prismaUnscoped.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id }, select: { id: true, deletedAt: true, amount: true, studentId: true, courseId: true } });
      if (!payment || payment.deletedAt) throw new NotFoundException("paymentNotFound");
      const enrollment = await tx.enrollment.findUnique({ where: { studentId_courseId: { studentId: payment.studentId, courseId: payment.courseId } }, select: { id: true } });
      if (enrollment) await tx.$queryRaw`SELECT "id" FROM "Enrollment" WHERE "id" = ${enrollment.id} FOR UPDATE`;
      const active = await tx.payment.findUnique({ where: { id }, select: { deletedAt: true } });
      if (active?.deletedAt) throw new NotFoundException("paymentNotFound");
      const [paid, refunded] = await Promise.all([
        tx.payment.aggregate({ where: { studentId: payment.studentId, courseId: payment.courseId, deletedAt: null }, _sum: { amount: true } }),
        tx.refund.aggregate({ where: { studentId: payment.studentId, courseId: payment.courseId, deletedAt: null }, _sum: { amount: true } }),
      ]);
      if ((paid._sum.amount ?? 0) - payment.amount < (refunded._sum.amount ?? 0)) throw new ConflictException("paymentCoversRefund");
      await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record({ userId: actor.id, entityType: "Payment", entityId: id, action: "DELETE",
        metadata: { studentId: payment.studentId, courseId: payment.courseId, amount: payment.amount } }, tx);
    });
  }
}
