import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC вместо esbuild: NestJS нужен emitDecoratorMetadata, esbuild его не умеет.
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
    // Одна Postgres в контейнере на весь прогон (test/global-setup.ts)
    globalSetup: ["test/global-setup.ts"],
    // e2e-тесты пишут в одну базу — последовательно, чтобы не мешать друг другу
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
