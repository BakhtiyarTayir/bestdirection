import { z } from "zod";

// Переменные окружения проверяются при старте: без них api не поднимается,
// а не падает позже на первом запросе. В docker-compose.prod.yml каждая
// перечислена явно — Compose не пробрасывает .env в контейнер сам.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  // Тот же секрет, что у web: им зашифрована сессионная кука Auth.js
  AUTH_SECRET: z.string().min(16),
  // Адрес web, откуда разрешены изменяющие запросы (проверка Origin)
  APP_URL: z.string().url(),
  // Секрет серверных вызовов из web, у которых нет заголовка Origin
  INTERNAL_TOKEN: z.string().min(32),
  // Каталоги загрузок. Оба — docker-тома, общие с web: пути по умолчанию
  // совпадают с тем, как они смонтированы в контейнер (docker-compose.prod.yml).
  // Публичные картинки и видео раздаются по /uploads/..., работы учеников
  // лежат отдельно и выдаются только с проверкой прав.
  PUBLIC_UPLOAD_DIR: z.string().min(1).default("/app/public/uploads"),
  PRIVATE_UPLOAD_DIR: z.string().min(1).default("/app/uploads"),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Неверные переменные окружения api:\n  ${problems.join("\n  ")}`);
  }
  return parsed.data;
}
