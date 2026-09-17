import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";

export const API_PREFIX = "api/v2";

/** Общая настройка приложения — и для main.ts, и для e2e-тестов. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix(API_PREFIX);
  // Снаружи api доступен только через Caddy: IP клиента — из X-Forwarded-For
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Ответы api персональные — не кэшировать ни браузеру, ни прокси
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.enableShutdownHooks();
  return app;
}
