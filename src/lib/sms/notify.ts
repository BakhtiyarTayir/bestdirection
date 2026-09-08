import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { EskizError, isEskizConfigured, sendOne } from "./eskiz";
import { countSmsParts, normalizePhone } from "./phone";

/**
 * Отправка одного СМС по принципу telegram/notify.ts: молча выходит, если
 * канал не настроен, и не пробрасывает ошибку — уведомление не должно
 * ронять основную операцию, ради которой его посылают.
 *
 * Всё пишется в SmsLog: СМС стоят денег, и без журнала не разобрать, за что
 * списали и дошло ли сообщение.
 */
export async function sendSms(params: {
  phone: string | null | undefined;
  text: string;
  userId?: string | null;
  broadcastId?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!isEskizConfigured()) return { sent: false, reason: "notConfigured" };

  const phone = normalizePhone(params.phone);
  if (!phone) {
    // Кривой номер логируем: иначе получатель молча выпадет из рассылки
    await logFailure(params, "invalidPhone");
    return { sent: false, reason: "invalidPhone" };
  }

  const text = params.text.trim();
  if (!text) return { sent: false, reason: "emptyText" };

  const userSmsId = randomUUID();
  const { parts } = countSmsParts(text);

  const log = await prisma.smsLog.create({
    data: {
      phone,
      text,
      status: "QUEUED",
      userSmsId,
      parts,
      userId: params.userId ?? null,
      broadcastId: params.broadcastId ?? null,
    },
    select: { id: true },
  });

  try {
    const result = await sendOne({ phone, text, userSmsId, callbackUrl: callbackUrl() });
    await prisma.smsLog.update({
      where: { id: log.id },
      data: { status: "SENT", providerId: result.id },
    });
    return { sent: true };
  } catch (error) {
    const message = error instanceof EskizError ? error.message : String(error);
    console.error("SMS send failed:", message);
    await prisma.smsLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: message.slice(0, 500) },
    });
    return { sent: false, reason: "providerError" };
  }
}

async function logFailure(
  params: { phone?: string | null; text: string; userId?: string | null; broadcastId?: string | null },
  error: string
) {
  try {
    await prisma.smsLog.create({
      data: {
        phone: params.phone?.trim() || "—",
        text: params.text.slice(0, 500),
        status: "FAILED",
        error,
        userId: params.userId ?? null,
        broadcastId: params.broadcastId ?? null,
      },
    });
  } catch (e) {
    console.error("Failed to log SMS failure:", e);
  }
}

/**
 * Адрес, куда Eskiz присылает статус доставки. Без него журнал остался бы
 * в состоянии SENT навсегда — дошло сообщение или нет, было бы неизвестно.
 */
export function callbackUrl(): string | undefined {
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/sms/callback`;
}
