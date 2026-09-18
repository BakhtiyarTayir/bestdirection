import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ZodValidationPipe } from "nestjs-zod";
import { AuditModule } from "./common/audit/audit.module";
import { AuthModule } from "./common/auth/auth.module";
import { SessionGuard } from "./common/auth/session.guard";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter";
import { PoliciesGuard } from "./common/policies/policies.guard";
import { PrismaModule } from "./common/prisma/prisma.module";
import { OriginGuard } from "./common/security/origin.guard";
import { ApiThrottlerGuard } from "./common/security/throttler.guard";
import { EnvModule } from "./config/env.module";
import { AuditLogModule } from "./modules/audit-log/audit-log.module";
import { HealthController } from "./modules/health/health.controller";
import { MeController } from "./modules/me/me.controller";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    // 120 запросов в минуту с одного IP — с запасом для живого пользователя
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    UsersModule,
    AuditLogModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    // Guards выполняются в порядке объявления: частота → CSRF → кто → что можно
    { provide: APP_GUARD, useClass: ApiThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
    // Тело запроса проверяется zod-схемой DTO; лишние поля отбрасываются
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
