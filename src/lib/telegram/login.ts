import { createHash, createHmac, timingSafeEqual } from "crypto";
import { prisma, prismaUnscoped } from "@/lib/prisma";

const AUTH_DATE_MAX_AGE_SECONDS = 10 * 60;

export interface TelegramProfile {
  telegramId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

/**
 * Проверяет подпись данных Telegram Login Widget.
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramWidgetPayload(
  payload: Record<string, string | undefined>
): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  const { hash, ...fields } = payload;
  if (!hash || !fields.id || !fields.auth_date) return false;

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate)) return false;
  if (Math.abs(Date.now() / 1000 - authDate) > AUTH_DATE_MAX_AGE_SECONDS) {
    return false;
  }

  const dataCheckString = Object.keys(fields)
    .filter((key) => fields[key] !== undefined && fields[key] !== "")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();

  const received = Buffer.from(hash, "hex");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
}

/**
 * Находит пользователя по Telegram ID (в личных чатах chat id == user id,
 * поэтому совпадает с telegramChatId существующей привязки бота)
 * или регистрирует нового студента.
 */
export async function findOrCreateTelegramUser(profile: TelegramProfile) {
  // Без soft-delete-фильтра: chatId остаётся занятым в уникальном индексе и
  // у удалённого аккаунта. Обычный findUnique его не видел, и следующий за
  // ним create падал с P2002 вместо отказа во входе.
  const existing = await prismaUnscoped.user.findUnique({
    where: { telegramChatId: profile.telegramId },
  });

  if (existing) {
    if (!existing.isActive || existing.deletedAt) return null;
    return existing;
  }

  return prisma.user.create({
    data: {
      firstName: profile.firstName?.trim() || profile.username || "Telegram",
      lastName: profile.lastName?.trim() || "",
      role: "STUDENT",
      telegramChatId: profile.telegramId,
      telegramUsername: profile.username || null,
    },
  });
}
