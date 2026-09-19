import { encode } from "@auth/core/jwt";
import bcrypt from "bcryptjs";
import { type ModuleMetadata, type Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inject } from "vitest";
import { PrismaClient, type Role } from "../generated/prisma";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";

export const TEST_SECRET = "test-auth-secret-0123456789abcdef";
export const TEST_APP_URL = "http://web.test";
export const TEST_MARKETING_URL = "http://landing.test";
export const TEST_INTERNAL_TOKEN = "test-internal-token-0123456789abcdef";

/** Загрузки тестов пишутся во временный каталог, а не в тома контейнера. */
export const TEST_UPLOAD_DIR = join(tmpdir(), "bd-api-test-uploads");

export function useTestEnv() {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.AUTH_SECRET = TEST_SECRET;
  process.env.APP_URL = TEST_APP_URL;
  process.env.MARKETING_URL = TEST_MARKETING_URL;
  process.env.INTERNAL_TOKEN = TEST_INTERNAL_TOKEN;
  process.env.PUBLIC_UPLOAD_DIR = join(TEST_UPLOAD_DIR, "public");
  process.env.PRIVATE_UPLOAD_DIR = join(TEST_UPLOAD_DIR, "private");
  process.env.NODE_ENV = "test";
}

/** Приложение как в проде (те же guards, фильтр, pipe) плюс тестовые контроллеры. */
export async function createTestApp(extra: { controllers?: Type[]; imports?: ModuleMetadata["imports"] } = {}) {
  useTestEnv();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extra.imports ?? [])],
    controllers: extra.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

let db: PrismaClient | undefined;
export function testDb() {
  useTestEnv();
  db ??= new PrismaClient();
  return db;
}

export async function createUser(data: {
  role: Role;
  isActive?: boolean;
  deletedAt?: Date | null;
  password?: string;
  telegramChatId?: string | null;
}) {
  const id = randomUUID().slice(0, 8);
  return testDb().user.create({
    data: {
      email: `${data.role.toLowerCase()}-${id}@test.uz`,
      firstName: data.role,
      lastName: id,
      role: data.role,
      isActive: data.isActive ?? true,
      deletedAt: data.deletedAt ?? null,
      passwordHash: data.password ? await bcrypt.hash(data.password, 4) : null,
      telegramChatId: data.telegramChatId ?? null,
    },
  });
}

export const SESSION_COOKIE = "authjs.session-token";
export const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

/**
 * Кука сессии в том виде, как её выписывает web (NextAuth v5): JWE с солью =
 * имя куки. roleInToken — что было в токене при входе; api его игнорирует.
 */
export async function sessionCookie(
  user: { id: string; email: string | null },
  options: { roleInToken?: Role; cookieName?: string; maxAge?: number; secret?: string } = {}
) {
  const cookieName = options.cookieName ?? SESSION_COOKIE;
  const token = await encode({
    token: { id: user.id, sub: user.id, email: user.email, role: options.roleInToken ?? "STUDENT" },
    secret: options.secret ?? TEST_SECRET,
    salt: cookieName,
    maxAge: options.maxAge ?? 3600,
  });
  return `${cookieName}=${token}`;
}

export type TestApp = NestExpressApplication;
