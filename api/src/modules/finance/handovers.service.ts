import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { toNoonUtc } from "../../common/date-only";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { CreateHandoverDto, HandoverFiltersDto } from "./dto/finance.dto";

/**
 * Журнал сдачи прибыли филиала владельцу. Тот же приём, что PayoutsService:
 * правок суммы нет, ошибочную запись помечают deletedAt и вносят заново.
 * Кассу и начисления не трогает — только уменьшает «осталось на руках» за
 * месяц forMonth (см. FinanceService.overview).
 */
@Injectable()
export class HandoversService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async list(filters: HandoverFiltersDto) {
    const { month, branchId } = filters;
    // Месяц фильтрует по forMonth — за какую прибыль сдали, а не по дате
    // сдачи: «осталось на руках» месяца считается по тому же признаку
    const where = {
      deletedAt: null,
      ...(month ? { forMonth: month } : {}),
      ...(branchId ? { branchId } : {}),
    };
    const [handovers, totals] = await Promise.all([
      this.prisma.profitHandover.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ handedAt: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
      this.prisma.profitHandover.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);
    return { handovers, total: totals._sum.amount ?? 0, count: totals._count };
  }

  async create(data: CreateHandoverDto, actor: SessionUser) {
    const branch = await this.prisma.branch.findUnique({ where: { id: data.branchId }, select: { id: true } });
    if (!branch) throw new NotFoundException("branchNotFound");

    const handover = await this.prisma.profitHandover.create({
      data: {
        branchId: data.branchId,
        amount: data.amount,
        handedAt: toNoonUtc(data.handedAt),
        forMonth: data.forMonth,
        receivedBy: data.receivedBy?.trim() || null,
        comment: data.comment?.trim() || null,
        createdById: actor.id,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "ProfitHandover",
      entityId: handover.id,
      action: "CREATE",
      metadata: { branchId: data.branchId, amount: data.amount, forMonth: data.forMonth },
    });

    return { id: handover.id };
  }

  /** Мягкое удаление: журнал не переписываем, ошибочную запись скрываем. */
  async remove(id: string, actor: SessionUser) {
    const handover = await this.prisma.profitHandover.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, amount: true, branchId: true, forMonth: true },
    });
    if (!handover || handover.deletedAt) throw new NotFoundException("handoverNotFound");

    await this.prisma.profitHandover.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.record({
      userId: actor.id,
      entityType: "ProfitHandover",
      entityId: id,
      action: "DELETE",
      metadata: { branchId: handover.branchId, amount: handover.amount, forMonth: handover.forMonth },
    });
  }
}
