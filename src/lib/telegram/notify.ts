import { getBot } from "./bot";

/**
 * Best-effort отправка сообщения пользователю в Telegram.
 * Молча выходит, если бот не настроен или chatId отсутствует/не привязан;
 * ошибки API логируются, но не пробрасываются — уведомления не должны
 * ломать основную операцию.
 */
export async function sendTelegramMessage(
  chatId: string | null | undefined,
  text: string
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  if (!chatId || chatId.startsWith("pending:")) return;

  try {
    await getBot().api.sendMessage(chatId, text);
  } catch (error) {
    console.error("Failed to send Telegram notification:", error);
  }
}
