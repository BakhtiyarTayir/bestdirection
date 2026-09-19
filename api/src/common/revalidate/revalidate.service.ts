import { Injectable, Logger } from "@nestjs/common";

/**
 * Сброс кэша лендинга в web.
 *
 * Страницы лендинга кэшируются Next.js по тегу и раньше сбрасывались прямо
 * из серверного действия. Теперь контент правит api, и Next об изменении сам
 * не узнает — поэтому после правки дёргаем внутренний маршрут web.
 *
 * Сбой намеренно не роняет операцию: контент уже сохранён, а страница
 * обновится по истечении кэша.
 */
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);

  async marketing() {
    const base = process.env.APP_INTERNAL_URL ?? process.env.APP_URL;
    const token = process.env.INTERNAL_TOKEN;
    if (!base || !token) return;

    try {
      const response = await fetch(`${base.replace(/\/$/, "")}/api/internal/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-token": token },
        body: JSON.stringify({ tag: "marketing" }),
      });
      if (!response.ok) {
        this.logger.warn(`Не удалось сбросить кэш лендинга: HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Не удалось сбросить кэш лендинга: ${String(error)}`);
    }
  }
}
