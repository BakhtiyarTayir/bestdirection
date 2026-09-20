import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService, computeChanges } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";

/**
 * Справочник филиалов. Пока только справочник + поле + фильтр (решение
 * владельца от 2026-09-20) — отдельной роли «администратор филиала» нет,
 * поэтому CRUD целиком под ADMIN (`manage all`), а чтение — всему персоналу
 * и ученикам, чтобы показать название филиала группы.
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  /** Выключенные филиалы тоже отдаём: их история (группы, платежи) остаётся видна. */
  all() {
    return this.prisma.branch.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async create(data: CreateBranchDto, actor: SessionUser) {
    const maxSort = await this.prisma.branch.aggregate({ _max: { sortOrder: true } });

    let branch;
    try {
      branch = await this.prisma.branch.create({
        data: {
          name: data.name,
          address: data.address || null,
          phone: data.phone || null,
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("branchNameExists");
      }
      throw error;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "Branch",
      entityId: branch.id,
      action: "CREATE",
      metadata: { name: branch.name },
    });
    return branch;
  }

  async update(id: string, data: UpdateBranchDto, actor: SessionUser) {
    const existing = await this.prisma.branch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("branchNotFound");

    let updated;
    try {
      updated = await this.prisma.branch.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.address !== undefined && { address: data.address || null }),
          ...(data.phone !== undefined && { phone: data.phone || null }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("branchNameExists");
      }
      throw error;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "Branch",
      entityId: id,
      action: "UPDATE",
      changes: computeChanges(existing, updated),
    });
    return updated;
  }

  /**
   * Удаление запрещено на уровне базы, пока в филиале есть группы
   * (`onDelete: Restrict`) — это почти всегда ошибка администратора, а не
   * намерение. Для выхода из положения есть isActive: false.
   */
  async remove(id: string, actor: SessionUser) {
    const existing = await this.prisma.branch.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) throw new NotFoundException("branchNotFound");

    try {
      await this.prisma.branch.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException("branchHasGroups");
      }
      throw error;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: "Branch",
      entityId: id,
      action: "DELETE",
      metadata: { name: existing.name },
    });
    return { id };
  }
}
