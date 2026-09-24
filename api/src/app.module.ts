import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { ZodValidationPipe } from "nestjs-zod";
import { AuditModule } from "./common/audit/audit.module";
import { AuthModule } from "./common/auth/auth.module";
import { SessionGuard } from "./common/auth/session.guard";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter";
import { PoliciesGuard } from "./common/policies/policies.guard";
import { PrismaModule } from "./common/prisma/prisma.module";
import { RevalidateModule } from "./common/revalidate/revalidate.module";
import { OriginGuard } from "./common/security/origin.guard";
import { ApiThrottlerGuard } from "./common/security/throttler.guard";
import { EnvModule } from "./config/env.module";
import { AssessmentsModule } from "./modules/assessments/assessments.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { AuditLogModule } from "./modules/audit-log/audit-log.module";
import { BillingModule } from "./modules/billing/billing.module";
import { BranchesModule } from "./modules/branches/branches.module";
import { CoursesModule } from "./modules/courses/courses.module";
import { EnrollmentRequestsModule } from "./modules/enrollment-requests/enrollment-requests.module";
import { GroupsModule } from "./modules/groups/groups.module";
import { AuthModule as AuthApiModule } from "./modules/auth/auth.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { HomeworkModule } from "./modules/homework/homework.module";
import { LessonsModule } from "./modules/lessons/lessons.module";
import { MarketingModule } from "./modules/marketing/marketing.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ParentNotificationsModule } from "./modules/parent-notifications/parent-notifications.module";
import { ParentsModule } from "./modules/parents/parents.module";
import { SalaryModule } from "./modules/salary/salary.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { HealthController } from "./modules/health/health.controller";
import { MeController } from "./modules/me/me.controller";
import { TelegramModule } from "./common/telegram/telegram.module";
import { TrashModule } from "./modules/trash/trash.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    RevalidateModule,
    AuditModule,
    AuthModule,
    // 120 запросов в минуту с одного IP — с запасом для живого пользователя
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    // Еженедельная сводка родителям (WeeklyDigestService) — единственный
    // потребитель cron в api на сегодня
    ScheduleModule.forRoot(),
    UsersModule,
    AuditLogModule,
    BillingModule,
    BranchesModule,
    CoursesModule,
    EnrollmentRequestsModule,
    GroupsModule,
    AttendanceModule,
    LessonsModule,
    HomeworkModule,
    NotificationsModule,
    MarketingModule,
    DashboardModule,
    AuthApiModule,
    AssessmentsModule,
    ParentsModule,
    ParentNotificationsModule,
    TelegramModule,
    TrashModule,
    SalaryModule,
    FinanceModule,
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
