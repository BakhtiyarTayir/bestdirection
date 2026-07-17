"use server";

import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

const LOGIN_REQUEST_TTL_MS = 10 * 60 * 1000;

// ---------- getTelegramBotUsername ----------
// Username бота отдаём с сервера в рантайме: NEXT_PUBLIC_-инлайн не работает,
// потому что прод-образ собирается из git-архива без .env.
export async function getTelegramBotUsername() {
  const username =
    process.env.TELEGRAM_BOT_USERNAME ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    null;
  return { success: true, data: { username } };
}

// ---------- createTelegramLoginRequest ----------
// Публичный: вызывается со страницы входа до аутентификации.
export async function createTelegramLoginRequest() {
  // Попутная уборка истёкших заявок
  await prisma.telegramAuthRequest.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const code = randomBytes(16).toString("hex");

  await prisma.telegramAuthRequest.create({
    data: {
      code,
      expiresAt: new Date(Date.now() + LOGIN_REQUEST_TTL_MS),
    },
  });

  return { success: true, data: { code } };
}

// ---------- getTelegramLoginStatus ----------
// Публичный: страница входа опрашивает статус, пока пользователь
// подтверждает вход в чате с ботом.
export async function getTelegramLoginStatus(code: string) {
  if (typeof code !== "string" || !/^[0-9a-f]{32}$/.test(code)) {
    return { success: false, error: "Invalid code" };
  }

  const request = await prisma.telegramAuthRequest.findUnique({
    where: { code },
    select: { status: true, expiresAt: true },
  });

  if (!request || request.expiresAt < new Date()) {
    return { success: true, data: { status: "EXPIRED" as const } };
  }

  return {
    success: true,
    data: { status: request.status as "PENDING" | "CONFIRMED" },
  };
}
