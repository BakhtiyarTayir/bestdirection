"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { randomBytes } from "crypto";

// ---------- generateTelegramLinkCode ----------
export async function generateTelegramLinkCode() {
  return withAuth(async (session) => {
    const code = randomBytes(16).toString("hex");

    // Store code as pending telegramChatId
    await prisma.user.update({
      where: { id: session.user.id },
      data: { telegramChatId: `pending:${code}` },
    });

    return { success: true, data: { code } };
  });
}

// ---------- getTelegramStatus ----------
export async function getTelegramStatus() {
  return withAuth(async (session) => {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { telegramChatId: true, telegramUsername: true },
    });

    const isLinked = !!user?.telegramChatId && !user.telegramChatId.startsWith("pending:");

    return {
      success: true,
      data: {
        isLinked,
        username: isLinked ? user?.telegramUsername : null,
      },
    };
  });
}

// ---------- unlinkTelegram ----------
export async function unlinkTelegram() {
  return withAuth(async (session) => {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { telegramChatId: null, telegramUsername: null },
    });

    return { success: true };
  });
}
