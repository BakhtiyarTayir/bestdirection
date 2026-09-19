import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/lib/auth";
import { checkActionRateLimit } from "@/lib/action-rate-limit";

const { GET, POST: originalPost } = handlers;

/**
 * Поток попыток входа ограничен счётчиком в памяти процесса: прежний лимитер
 * опирался на Upstash, которого в проде нет, и не работал вовсе (аудит 7.1).
 * Сам разбор пароля ограничен отдельно, по неудачным попыткам (src/lib/auth.ts).
 */
async function POST(request: NextRequest) {
  if (!(await checkActionRateLimit("auth-route", 30))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  return originalPost(request);
}

export { GET, POST };
