import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { CreateAdjustmentDto } from "./dto/salary.dto";

/**
 * Журнал премий и штрафов преподавателям. Тот же приём, что PayoutsService:
 * правок суммы нет, ошибочную запись помечают deletedAt и вносят заново.
 * Корректировка — часть НАЧИСЛЕННОГО (читает SalaryService), деньги из кассы
 * она не двигает.
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  async create(data: CreateAdjustmentDto, actor: SessionUser) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: data.teacherId },
      select: { branchId: true },
    });
    if (!teacher) throw new NotFoundException("userNotFound");

    const adjustment = await this.prisma.teacherSalaryAdjustment.create({
      data: {
        teacherId: data.teacherId,
        kind: data.kind,
        amount: data.amount,
        month: data.month,
        reason: data.reason,
        // Снимок филиала преподавателя на момент записи — как у выплаты
        branchId: teacher.branchId,
        createdById: actor.id,
      },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "TeacherSalaryAdjustment",
      entityId: adjustment.id,
      action: "CREATE",
      metadata: {
        teacherId: data.teacherId,
        kind: data.kind,
        amount: data.amount,
        month: data.month,
        reason: data.reason,
      },
    });

    return { id: adjustment.id };
  }

  /** Мягкое удаление: журнал не переписываем, ошибочную запись скрываем. */
  async remove(id: string, actor: SessionUser) {
    const adjustment = await this.prisma.teacherSalaryAdjustment.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, kind: true, amount: true, month: true, teacherId: true },
    });
    if (!adjustment || adjustment.deletedAt) throw new NotFoundException("adjustmentNotFound");

    await this.prisma.teacherSalaryAdjustment.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.record({
      userId: actor.id,
      entityType: "TeacherSalaryAdjustment",
      entityId: id,
      action: "DELETE",
      metadata: {
        teacherId: adjustment.teacherId,
        kind: adjustment.kind,
        amount: adjustment.amount,
        month: adjustment.month,
      },
    });
  }
}
