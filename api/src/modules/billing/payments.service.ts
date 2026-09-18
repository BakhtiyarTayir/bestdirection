import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { CreatePaymentDto, PaymentFiltersDto } from "./dto/billing.dto";

/** Границы календарного месяца "YYYY-MM" в UTC: [начало, начало следующего) */
function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(year, monthNumber - 1, 1)), lt: new Date(Date.UTC(year, monthNumber, 1)) };
}

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
   * Журнал оплат с фильтрами. month фильтрует по дате приёма денег (касса за
   * месяц), а не по периоду forMonth.
   */
  async list(filters: PaymentFiltersDto) {
    const { month, courseId, groupId, studentId, method } = filters;
    const where = {
      deletedAt: null,
      ...(month ? { paidAt: monthRange(month) } : {}),
      ...(courseId ? { courseId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(method ? { method } : {}),
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
        take: 500,
      }),
      this.prisma.payment.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);

    return { payments, total: totals._sum.amount ?? 0, count: totals._count };
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
            course: { select: { title: true, price: true } },
            groupId: true,
            group: { select: { name: true } },
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
          price: enrollment.course.price,
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

    const payment = await this.prisma.payment.create({
      data: {
        studentId: data.studentId,
        courseId: data.courseId,
        // Группу берём из записи студента: в форме она справочная
        groupId: data.groupId || enrollment.groupId,
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

  /** Мягкое удаление: журнал кассы не переписываем, ошибочную запись скрываем. */
  async remove(id: string, actor: SessionUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, amount: true, studentId: true, courseId: true },
    });
    if (!payment || payment.deletedAt) throw new NotFoundException("paymentNotFound");

    await this.prisma.payment.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.record({
      userId: actor.id,
      entityType: "Payment",
      entityId: id,
      action: "DELETE",
      metadata: { studentId: payment.studentId, courseId: payment.courseId, amount: payment.amount },
    });
  }
}
