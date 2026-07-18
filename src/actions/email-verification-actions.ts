"use server";

import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, isEmailConfigured } from "@/lib/email";
import {
  EMAIL_CODE_TTL_MS,
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  hashVerificationCode,
} from "@/lib/email-codes";
import { randomInt } from "crypto";
import { z } from "zod";

// ---------- requestEmailVerification ----------
// Публичный: шаг 1 регистрации. Отправляет 6-значный код на почту.
export async function requestEmailVerification(data: {
  email: string;
  locale?: string;
}) {
  const parsed = z.string().trim().email().safeParse(data.email);
  if (!parsed.success) {
    return { success: false, error: "invalidData" };
  }
  const email = parsed.data.toLowerCase();

  if (!isEmailConfigured()) {
    return { success: false, error: "emailNotConfigured" };
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { success: false, error: "emailAlreadyExists" };
  }

  // Кулдаун повторной отправки
  const existingCode = await prisma.emailVerificationCode.findUnique({
    where: { email },
  });
  if (
    existingCode &&
    Date.now() - existingCode.sentAt.getTime() < EMAIL_CODE_RESEND_COOLDOWN_MS
  ) {
    return { success: false, error: "resendCooldown" };
  }

  const code = String(randomInt(100000, 1000000));

  await prisma.emailVerificationCode.upsert({
    where: { email },
    create: {
      email,
      codeHash: hashVerificationCode(email, code),
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
    },
    update: {
      codeHash: hashVerificationCode(email, code),
      attempts: 0,
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
      sentAt: new Date(),
    },
  });

  const sent = await sendVerificationEmail(email, code, data.locale ?? "ru");
  if (!sent) {
    return { success: false, error: "emailSendFailed" };
  }

  return { success: true };
}
