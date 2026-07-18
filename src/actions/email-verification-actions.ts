"use server";

import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, isEmailConfigured } from "@/lib/email";
import {
  EMAIL_CODE_TTL_MS,
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_MAX_ATTEMPTS,
  hashVerificationCode,
} from "@/lib/email-codes";
import { randomInt } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { checkActionRateLimit } from "@/lib/action-rate-limit";

// ---------- requestEmailVerification ----------
// Публичный: шаг 1 регистрации. Отправляет 6-значный код на почту.
export async function requestEmailVerification(data: {
  email: string;
  locale?: string;
}) {
  if (!(await checkActionRateLimit("email-code", 5))) {
    return { success: false, error: "tooManyRequests" };
  }

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

// ---------- requestPasswordReset ----------
// Публичный: шаг 1 восстановления пароля. Пользователь должен существовать.
export async function requestPasswordReset(data: {
  email: string;
  locale?: string;
}) {
  if (!(await checkActionRateLimit("email-code", 5))) {
    return { success: false, error: "tooManyRequests" };
  }

  const parsed = z.string().trim().email().safeParse(data.email);
  if (!parsed.success) {
    return { success: false, error: "invalidData" };
  }
  const email = parsed.data.toLowerCase();

  if (!isEmailConfigured()) {
    return { success: false, error: "emailNotConfigured" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.deletedAt) {
    return { success: false, error: "userNotFound" };
  }

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

  const sent = await sendVerificationEmail(email, code, data.locale ?? "ru", "reset");
  if (!sent) {
    return { success: false, error: "emailSendFailed" };
  }

  return { success: true };
}

// ---------- resetPassword ----------
// Публичный: финальный шаг восстановления — код гасится, пароль меняется.
export async function resetPassword(data: {
  email: string;
  code: string;
  newPassword: string;
}) {
  if (!(await checkActionRateLimit("verify-code", 10))) {
    return { success: false, error: "tooManyRequests" };
  }

  const parsed = z
    .object({
      email: z.string().trim().email(),
      code: z.string().regex(/^\d{6}$/),
      newPassword: z.string().min(8),
    })
    .safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "invalidData" };
  }
  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.deletedAt) {
    return { success: false, error: "userNotFound" };
  }

  const verification = await prisma.emailVerificationCode.findUnique({
    where: { email },
  });
  if (!verification || verification.expiresAt < new Date()) {
    return { success: false, error: "codeExpired" };
  }
  if (verification.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    return { success: false, error: "tooManyAttempts" };
  }
  if (verification.codeHash !== hashVerificationCode(email, parsed.data.code)) {
    await prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    return { success: false, error: "invalidCode" };
  }

  await prisma.emailVerificationCode.delete({ where: { id: verification.id } });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return { success: true };
}

// ---------- verifyEmailCode ----------
// Публичный: шаг 2 регистрации. Проверяет код, НЕ удаляя его —
// окончательно код гасится в registerUser при создании аккаунта.
export async function verifyEmailCode(data: { email: string; code: string }) {
  if (!(await checkActionRateLimit("verify-code", 10))) {
    return { success: false, error: "tooManyRequests" };
  }

  const email = data.email?.trim().toLowerCase();
  if (!email || !/^\d{6}$/.test(data.code ?? "")) {
    return { success: false, error: "invalidCode" };
  }

  const verification = await prisma.emailVerificationCode.findUnique({
    where: { email },
  });

  if (!verification || verification.expiresAt < new Date()) {
    return { success: false, error: "codeExpired" };
  }
  if (verification.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    return { success: false, error: "tooManyAttempts" };
  }
  if (verification.codeHash !== hashVerificationCode(email, data.code)) {
    await prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    return { success: false, error: "invalidCode" };
  }

  return { success: true };
}
