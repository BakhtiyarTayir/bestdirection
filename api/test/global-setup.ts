import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

// Одна одноразовая Postgres на весь прогон. Миграции — те же, что в проде:
// схема общая с web (prisma/schema.prisma в корне репозитория).
export default async function setup(project: TestProject) {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").start();
  const databaseUrl = container.getConnectionUri();

  const apiRoot = path.resolve(__dirname, "..");
  execFileSync(
    path.join(apiRoot, "node_modules/.bin/prisma"),
    ["migrate", "deploy", "--schema", path.join(apiRoot, "../prisma/schema.prisma")],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }
  );

  project.provide("databaseUrl", databaseUrl);
  return async () => {
    await container.stop();
  };
}
