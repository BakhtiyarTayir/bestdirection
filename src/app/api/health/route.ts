import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkActionRateLimit } from "@/lib/action-rate-limit";

export async function GET() {
  // Счётчик в памяти процесса: прежний лимитер опирался на Upstash, которого
  // в проде нет, и не работал вовсе (аудит 7.1)
  if (!(await checkActionRateLimit("health", 60))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: "Database connection failed",
      },
      { status: 503 }
    );
  }
}
