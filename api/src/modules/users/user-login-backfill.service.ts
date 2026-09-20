import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { generateUniqueLogin, loginBaseFromEmail, loginBaseFromName } from "../../common/auth/login-generator";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Заполняет login существующим строкам без него (шаг 1 отказа от почты,
 * PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1). Выполняется при старте api,
 * ДО того как приложение начнёт принимать запросы (см. main.ts: app.listen()
 * вызывает app.init(), а именно на нём срабатывает OnApplicationBootstrap) —
 * поэтому владелец центра не может войти без логина даже в первую же секунду
 * после деплоя.
 *
 * Идемпотентен (трогает только login IS NULL) и безопасен на каждом
 * перезапуске: на проде это одноразовая работа, а в тестах, где один api
 * поднимается на файл спецификации и делит одну базу со всеми остальными
 * (vitest.config.mts: fileParallelism: false), backfill просто не находит
 * новых строк без логина и завершается мгновенно.
 *
 * Через prismaUnscoped: и мягко удалённые пользователи должны получить
 * логин — иначе администратор, восстановивший такую запись, не смог бы
 * ею воспользоваться.
 */
@Injectable()
export class UserLoginBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UserLoginBackfillService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async onApplicationBootstrap() {
    await this.run();
  }

  /** Публичный метод — используется и тестами, и разовой командой отчёта (export-logins). */
  async run(): Promise<{ filled: number }> {
    const prisma = this.prismaService.prismaUnscoped;

    const withoutLogin = await prisma.user.findMany({
      where: { login: null },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: { createdAt: "asc" },
    });
    if (withoutLogin.length === 0) return { filled: 0 };

    for (const user of withoutLogin) {
      const base = (user.email && loginBaseFromEmail(user.email)) || loginBaseFromName(user.firstName, user.lastName);
      const login = await generateUniqueLogin(prisma, base);
      await prisma.user.update({ where: { id: user.id }, data: { login } });
    }

    this.logger.log(`Логин выдан ${withoutLogin.length} пользователям, у которых его не было`);
    return { filled: withoutLogin.length };
  }
}
