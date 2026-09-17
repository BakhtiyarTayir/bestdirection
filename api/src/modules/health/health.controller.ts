import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../../common/auth/decorators";
import { PrismaService } from "../../common/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  /** Для smoke-проверки после деплоя: api жив и видит базу. */
  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    try {
      await this.prismaService.prismaUnscoped.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("databaseUnavailable");
    }
    return { status: "ok" };
  }
}
