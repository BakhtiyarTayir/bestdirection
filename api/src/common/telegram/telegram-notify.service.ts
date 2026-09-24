import { Injectable, Logger } from "@nestjs/common";

/**
 * Отправка уведомления в Telegram по HTTP, без библиотеки бота: api пока только
 * шлёт сообщения, а приём обновлений остаётся в web до этапа 6.
 *
 * Best-effort: молча выходит, если бот не настроен или chat id нет; ошибки
 * логируются, но не пробрасываются — уведомление не должно ломать операцию.
 */
@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  async send(chatId: string | null | undefined, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId) return;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        // Отправку ждут синхронные операции (отметка в журнале, проверка
        // задания): без предела медленный Telegram подвешивал бы их ответ
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        this.logger.warn(`Telegram ответил ${response.status} на sendMessage`);
      }
    } catch (error) {
      this.logger.warn(`Не удалось отправить уведомление в Telegram: ${String(error)}`);
    }
  }
}
