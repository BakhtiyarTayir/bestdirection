import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface AuditLogInput {
  userId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

/**
 * Клиент внутри транзакции. Структурный тип, а не Prisma.TransactionClient:
 * у расширенного клиента (мягкое удаление) свой несовместимый тип транзакции,
 * а нужен здесь только auditLog.create.
 */
export interface AuditTransactionClient {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> };
}

/** Тот же контракт, что у src/lib/audit.ts в web. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Без tx запись идёт отдельно, и её ошибка не ломает основное действие — как
   * в web. С tx запись входит в ту же транзакцию и падает вместе с ней: так
   * пишутся денежные операции и окончательные удаления, чтобы изменение не
   * прошло без следа в журнале.
   */
  async record(input: AuditLogInput, tx?: AuditTransactionClient): Promise<void> {
    const data = {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changes: (input.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }

    try {
      await this.prismaService.prismaUnscoped.auditLog.create({ data });
    } catch (error) {
      this.logger.error("Не удалось записать аудит", error as Error);
    }
  }
}

// Секреты в журнал не попадают ни в каком виде: ни хэш, ни зашифрованный пароль
const NEVER_AUDITED_KEYS = new Set(["passwordHash", "passwordEnc"]);

export function computeChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(newData)) {
    if (NEVER_AUDITED_KEYS.has(key)) continue;
    if (newData[key] !== undefined && oldData[key] !== newData[key]) {
      changes[key] = { old: oldData[key], new: newData[key] };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}
