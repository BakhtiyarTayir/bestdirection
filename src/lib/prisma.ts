import { PrismaClient } from "@/generated/prisma";

const SOFT_DELETE_MODELS = ["User", "Course", "Lesson"];

function isSoftDeleteModel(model: string | undefined): boolean {
  return SOFT_DELETE_MODELS.includes(model ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWhere = Record<string, any>;

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  const client = new PrismaClient();

  return client.$extends({
    query: {
      $allModels: {
        async findFirst({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const where = (args.where ?? {}) as AnyWhere;
            if (where.deletedAt === undefined) {
              args.where = { ...where, deletedAt: null };
            }
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const where = (args.where ?? {}) as AnyWhere;
            if (where.deletedAt === undefined) {
              args.where = { ...where, deletedAt: null } as typeof args.where;
            }
          }
          return query(args);
        },
        async findMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const where = (args.where ?? {}) as AnyWhere;
            if (where.deletedAt === undefined) {
              args.where = { ...where, deletedAt: null };
            }
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const where = (args.where ?? {}) as AnyWhere;
            if (where.deletedAt === undefined) {
              args.where = { ...where, deletedAt: null };
            }
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (client as any)[modelKey].update({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (client as any)[modelKey].updateMany({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
