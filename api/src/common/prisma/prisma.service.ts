import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "../../../generated/prisma";

// Модели с мягким удалением: обычный клиент их удалённые записи не видит,
// а delete превращает в простановку deletedAt. Повторяет src/lib/prisma.ts
// из web — поведение должно совпадать, пока оба приложения работают с одной БД.
const SOFT_DELETE_MODELS = new Set(["User", "Course", "Lesson"]);

type AnyWhere = Record<string, unknown>;

function withoutDeleted<T extends { where?: unknown }>(model: string, args: T): T {
  if (!SOFT_DELETE_MODELS.has(model)) return args;
  const where = (args.where ?? {}) as AnyWhere;
  if (where.deletedAt !== undefined) return args;
  return { ...args, where: { ...where, deletedAt: null } };
}

function createClients() {
  const unscoped = new PrismaClient();

  const scoped = unscoped.$extends({
    query: {
      $allModels: {
        findFirst: ({ model, args, query }) => query(withoutDeleted(model, args)),
        findFirstOrThrow: ({ model, args, query }) => query(withoutDeleted(model, args)),
        findUnique: ({ model, args, query }) => query(withoutDeleted(model, args)),
        findUniqueOrThrow: ({ model, args, query }) => query(withoutDeleted(model, args)),
        findMany: ({ model, args, query }) => query(withoutDeleted(model, args)),
        count: ({ model, args, query }) => query(withoutDeleted(model, args)),
        async delete({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const delegate = unscoped[lowerFirst(model) as "user"] as unknown as {
            update(a: unknown): Promise<unknown>;
          };
          return delegate.update({ where: args.where, data: { deletedAt: new Date() } });
        },
        async deleteMany({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const delegate = unscoped[lowerFirst(model) as "user"] as unknown as {
            updateMany(a: unknown): Promise<unknown>;
          };
          return delegate.updateMany({ where: args.where, data: { deletedAt: new Date() } });
        },
      },
    },
  });

  return { unscoped, scoped };
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export type ScopedPrismaClient = ReturnType<typeof createClients>["scoped"];

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly clients = createClients();

  /** Обычный клиент: удалённые User, Course, Lesson не видны. */
  get prisma(): ScopedPrismaClient {
    return this.clients.scoped;
  }

  /**
   * Без фильтра мягкого удаления. Нужен корзине, окончательному удалению и
   * проверкам уникальности: индексы в БД про deletedAt не знают, и login или
   * slug удалённой записи остаются занятыми.
   */
  get prismaUnscoped(): PrismaClient {
    return this.clients.unscoped;
  }

  async onModuleDestroy() {
    await this.clients.unscoped.$disconnect();
  }
}
