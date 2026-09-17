import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../src/common/audit/audit.service";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { createTestApp, createUser, testDb, type TestApp } from "./helpers";

describe("AuditService (раздел 4.9 плана)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("запись в транзакции откатывается вместе с ней", async () => {
    const user = await createUser({ role: "ADMIN" });
    const audit = app.get(AuditService);
    const { prismaUnscoped } = app.get(PrismaService);

    await expect(
      prismaUnscoped.$transaction(async (tx) => {
        await audit.record({ userId: user.id, entityType: "Test", entityId: "rolled-back", action: "DELETE" }, tx);
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");

    expect(await testDb().auditLog.count({ where: { entityId: "rolled-back" } })).toBe(0);
  });

  it("без транзакции ошибка записи не ломает действие", async () => {
    const audit = app.get(AuditService);
    // Нет такого пользователя — внешний ключ не даст вставить строку
    await expect(
      audit.record({ userId: "no-such-user", entityType: "Test", entityId: "x", action: "CREATE" })
    ).resolves.toBeUndefined();
  });

  it("обычный клиент не видит удалённых, prismaUnscoped — видит", async () => {
    const user = await createUser({ role: "STUDENT", deletedAt: new Date() });
    const service = app.get(PrismaService);
    expect(await service.prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await service.prismaUnscoped.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it("delete на модели с мягким удалением ставит deletedAt", async () => {
    const user = await createUser({ role: "STUDENT" });
    const service = app.get(PrismaService);
    await service.prisma.user.delete({ where: { id: user.id } });
    const row = await service.prismaUnscoped.user.findUnique({ where: { id: user.id } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});
