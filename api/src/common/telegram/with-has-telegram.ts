/**
 * Меняет telegramChatId на признак hasTelegram в объекте, который уходит
 * наружу. Сам chat id наружу не отдаём (план PLAN-TELEGRAM-INVITE-2026-09-24):
 * карточке пользователя и панели родителей достаточно знать, привязан ли
 * Telegram, чтобы показать кнопку «Пригласить» или статус «привязан ✓».
 */
export function withHasTelegram<T extends { telegramChatId: string | null }>(
  user: T
): Omit<T, "telegramChatId"> & { hasTelegram: boolean } {
  const { telegramChatId, ...rest } = user;
  return { ...rest, hasTelegram: Boolean(telegramChatId) };
}
