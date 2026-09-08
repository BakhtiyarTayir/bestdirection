import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Приём статусов доставки от Eskiz.
 *
 * Шлюз шлёт POST на адрес из callback_url в формате:
 * { request_id, message_id, user_sms_id, phone_number, sms_count, status, status_date }
 *
 * Строка журнала находится по user_sms_id — его мы сами выдаём при отправке.
 * Без вебхука сообщения навсегда оставались бы в статусе SENT, и дошли они
 * или нет, было бы неизвестно.
 */

// Eskiz-статусы → наш enum. DELIVRD — не опечатка, это код SMPP.
const STATUS_MAP: Record<string, "DELIVERED" | "FAILED" | "SENT"> = {
  DELIVRD: "DELIVERED",
  DELIVERED: "DELIVERED",
  UNDELIV: "FAILED",
  REJECTD: "FAILED",
  EXPIRED: "FAILED",
  UNKNOWN: "FAILED",
  FAILED: "FAILED",
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      user_sms_id?: string;
      message_id?: string;
      status?: string;
      sms_count?: string | number;
    };

    const userSmsId = body.user_sms_id;
    if (!userSmsId) {
      // Отвечаем 200: 4xx заставит Eskiz бесконечно повторять доставку
      return NextResponse.json({ ok: true, skipped: "no user_sms_id" });
    }

    const mapped = STATUS_MAP[(body.status ?? "").toUpperCase()];
    const parts = body.sms_count ? Number(body.sms_count) : undefined;

    await prisma.smsLog.updateMany({
      where: { userSmsId },
      data: {
        status: mapped ?? "SENT",
        providerId: body.message_id ?? undefined,
        parts: Number.isFinite(parts) ? parts : undefined,
        deliveredAt: mapped === "DELIVERED" ? new Date() : undefined,
        error: mapped === "FAILED" ? (body.status ?? "unknown") : undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("SMS callback error:", error);
    // Тоже 200: ошибка на нашей стороне не повод гонять очередь Eskiz
    return NextResponse.json({ ok: false });
  }
}
