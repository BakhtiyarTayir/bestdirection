import { NextResponse } from "next/server";
import { checkActionRateLimit } from "@/lib/action-rate-limit";

/**
 * Живо ли приложение. В базу больше не ходим — её состояние проверяет
 * /api/v2/health у api, а web с ней не разговаривает вовсе.
 */
export async function GET() {
  // Счётчик в памяти процесса: прежний лимитер опирался на Upstash, которого
  // в проде нет, и не работал вовсе (аудит 7.1)
  if (!(await checkActionRateLimit("health", 60))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const base = process.env.API_INTERNAL_URL ?? "http://api:4000";
  try {
    const response = await fetch(`${base}/api/v2/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`api ответил ${response.status}`);
  } catch {
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString(), error: "API unreachable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
