import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { loadEnv } from "./config/env";

async function bootstrap() {
  // Проверка окружения до создания приложения: понятная ошибка вместо падения DI
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  await app.listen(env.PORT, "0.0.0.0");
}

void bootstrap();
