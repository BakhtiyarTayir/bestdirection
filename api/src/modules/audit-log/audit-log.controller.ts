import { Controller, Get, Query } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";

const PAGE_SIZE = 50;

const querySchema = z.object({
  entityType: z.string().max(60).optional(),
  action: z.string().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

class AuditLogQueryDto extends createZodDto(querySchema) {}

/** Журнал аудита для администратора. Единственное место с постраничностью. */
@Controller("audit-log")
export class AuditLogController {
  constructor(private readonly prismaService: PrismaService) {}

  @CheckPolicies((ability) => ability.can("read", "AuditLog"))
  @Get()
  async list(@Query() query: AuditLogQueryDto) {
    const where = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: query.action } : {}),
    };

    const [logs, total] = await Promise.all([
      this.prismaService.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip: (query.page - 1) * PAGE_SIZE,
      }),
      this.prismaService.prisma.auditLog.count({ where }),
    ]);

    return { logs, total, page: query.page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) };
  }
}
