import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BillingLedgerService } from "./billing-ledger.service";
import { currentMonthKey, monthKey } from "./domain/billing";
import { advance } from "./domain/refund";
import { studentSearchWhere } from "./domain/student-search";
import type { CreateRefundDto, RefundFiltersDto } from "./dto/billing.dto";

const LIMIT = 500;

@Injectable()
export class RefundsService {
  constructor(private readonly prismaService: PrismaService, private readonly ledger: BillingLedgerService, private readonly audit: AuditService) {}
  private get prisma() { return this.prismaService.prisma; }

  async list(filters: RefundFiltersDto) {
    const { month, q, courseId, groupId, studentId, method, branchId } = filters;
    const [year, number] = month?.split("-").map(Number) ?? [];
    const where = {
      deletedAt: null,
      ...(month ? { refundedAt: { gte: new Date(Date.UTC(year, number - 1, 1)), lt: new Date(Date.UTC(year, number, 1)) } } : {}),
      ...(courseId ? { courseId } : {}), ...(groupId ? { groupId } : {}),
      ...(studentId ? { studentId } : {}), ...(method ? { method } : {}),
      ...(branchId ? { branchId } : {}),
      AND: studentSearchWhere(q).map((condition) => ({ student: condition })),
    };
    const [refunds, totals] = await Promise.all([
      this.prisma.refund.findMany({ where, include: {
        student: { select: { id: true, firstName: true, lastName: true, phone: true } },
        course: { select: { id: true, title: true } }, group: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      }, orderBy: [{ refundedAt: "desc" }, { createdAt: "desc" }], take: LIMIT }),
      this.prisma.refund.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);
    return { refunds, total: totals._sum.amount ?? 0, count: totals._count, limit: LIMIT };
  }

  async create(data: CreateRefundDto, actor: SessionUser) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: data.studentId, courseId: data.courseId } },
      select: { id: true, groupId: true, unenrolledFromGroupId: true },
    });
    if (!enrollment) throw new NotFoundException("notEnrolled");
    if (data.groupId && data.groupId !== (enrollment.groupId ?? enrollment.unenrolledFromGroupId)) throw new BadRequestException("groupMismatch");
    const refundedAt = toNoonUtc(data.refundedAt);
    const currentMonth = currentMonthKey();
    if (monthKey(refundedAt) > currentMonth) throw new BadRequestException("refundDateInFuture");
    // Resolve and freeze closed months before locking Enrollment. The freeze writes MonthlyCharge.
    const rows = await this.ledger.loadBillableEnrollments({ enrollmentId: enrollment.id }, { includeFree: true });
    if (!rows.length) throw new NotFoundException("notEnrolled");
    const schedules = await this.ledger.resolveSchedules(rows, currentMonth);
    const charged = (schedules.get(enrollment.id) ?? []).reduce((sum, row) => sum + row.charge.amount, 0);
    return this.prismaService.prismaUnscoped.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; groupId: string | null; unenrolledFromGroupId: string | null }[]>`SELECT "id", "groupId", "unenrolledFromGroupId" FROM "Enrollment" WHERE "id" = ${enrollment.id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException("notEnrolled");
      if (data.groupId && data.groupId !== (locked[0].groupId ?? locked[0].unenrolledFromGroupId)) throw new BadRequestException("groupMismatch");
      const first = await tx.payment.findFirst({ where: { studentId: data.studentId, courseId: data.courseId, deletedAt: null }, orderBy: { paidAt: "asc" }, select: { paidAt: true } });
      if (first && refundedAt.toISOString().slice(0, 10) < first.paidAt.toISOString().slice(0, 10)) throw new BadRequestException("refundDateBeforePayment");
      const [paid, refunded] = await Promise.all([
        tx.payment.aggregate({ where: { studentId: data.studentId, courseId: data.courseId, deletedAt: null }, _sum: { amount: true } }),
        tx.refund.aggregate({ where: { studentId: data.studentId, courseId: data.courseId, deletedAt: null }, _sum: { amount: true } }),
      ]);
      const available = advance(paid._sum.amount ?? 0, refunded._sum.amount ?? 0, charged);
      if (data.amount > available) throw new ConflictException("refundExceedsAdvance");
      const groupId = locked[0].groupId ?? locked[0].unenrolledFromGroupId;
      const branchId = groupId
        ? (await tx.group.findUnique({ where: { id: groupId }, select: { branchId: true } }))?.branchId ?? null
        : (await tx.user.findUnique({ where: { id: data.studentId }, select: { branchId: true } }))?.branchId ?? null;
      const refund = await tx.refund.create({ data: { studentId: data.studentId, courseId: data.courseId, groupId, branchId,
        amount: data.amount, method: data.method, refundedAt, comment: data.comment?.trim() || null, createdById: actor.id } });
      await this.audit.record({ userId: actor.id, entityType: "Refund", entityId: refund.id, action: "CREATE", metadata: {
        studentId: data.studentId, courseId: data.courseId, amount: data.amount, method: data.method, advance: available,
      } }, tx);
      return { id: refund.id };
    });
  }

  async remove(id: string, actor: SessionUser) {
    return this.prismaService.prismaUnscoped.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id }, select: { id: true, deletedAt: true, studentId: true, courseId: true, amount: true } });
      if (!refund || refund.deletedAt) throw new NotFoundException("refundNotFound");
      const deleted = await tx.refund.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (deleted.count === 0) throw new NotFoundException("refundNotFound");
      await this.audit.record({ userId: actor.id, entityType: "Refund", entityId: id, action: "DELETE", metadata: {
        studentId: refund.studentId, courseId: refund.courseId, amount: refund.amount,
      } }, tx);
    });
  }
}
