import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { CreatePayoutDto, PayoutFiltersDto } from "./dto/salary.dto";

/**
 * Журнал выплат преподавателям. Тот же приём, что PaymentsService у оплат
 * учеников: правок суммы нет, ошибочную запись помечают deletedAt и вносят
 * заново.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async list(filters: PayoutFiltersDto) {
    const { month, teacherId, branchId } = filters;
    const where = {
      deletedAt: null,
      // Месяц фильтрует по дате выдачи денег, а не по периоду forMonth —
      // как paidAt в журнале оплат учеников
      ...(month
        ? {
            paidAt: {
              gte: new Date(`${month}-01T00:00:00.000Z`),
              lt: new Date(`${addMonthToRangeEnd(month)}-01T00:00:00.000Z`),
            },
          }
        : {}),
      ...(teacherId ? { teacherId } : {}),
      ...(branchId ? { branchId } : {}),
    };

    const [payouts, totals] = await Promise.all([
      this.prisma.teacherPayout.findMany({
        where,
        include: {
          teacher: { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
      this.prisma.teacherPayout.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);

    return { payouts, total: totals._sum.amount ?? 0, count: totals._count };
  }

  /** Преподаватели для выбора в форме выплаты. */
  teacherOptions() {
    return this.prisma.user.findMany({
      where: { role: { in: ["TEACHER", "ADMIN"] }, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }

  async create(data: CreatePayoutDto, actor: SessionUser) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: data.teacherId },
      select: { branchId: true },
    });
    if (!teacher) throw new NotFoundException("userNotFound");

    const payout = await this.prisma.teacherPayout.create({
      data: {
        teacherId: data.teacherId,
        amount: data.amount,
        method: data.method,
        paidAt: toNoonUtc(data.paidAt),
        forMonth: data.forMonth,
        comment: data.comment?.trim() || null,
        // Приписка преподавателя справочная (как у пользователя), но для
        // выплаты это единственный источник филиала — своей группы у неё нет
        branchId: teacher.branchId,
        createdById: actor.id,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "TeacherPayout",
      entityId: payout.id,
      action: "CREATE",
      metadata: {
        teacherId: data.teacherId,
        amount: data.amount,
        method: data.method,
        forMonth: data.forMonth ?? null,
      },
    });

    return { id: payout.id };
  }

  /** Мягкое удаление: журнал выплат не переписываем, ошибочную запись скрываем. */
  async remove(id: string, actor: SessionUser) {
    const payout = await this.prisma.teacherPayout.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, amount: true, teacherId: true },
    });
    if (!payout || payout.deletedAt) throw new NotFoundException("payoutNotFound");

    await this.prisma.teacherPayout.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.record({
      userId: actor.id,
      entityType: "TeacherPayout",
      entityId: id,
      action: "DELETE",
      metadata: { teacherId: payout.teacherId, amount: payout.amount },
    });
  }
}

/** "YYYY-MM" следующего месяца — для полуоткрытого диапазона фильтра по дате выдачи */
function addMonthToRangeEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}
