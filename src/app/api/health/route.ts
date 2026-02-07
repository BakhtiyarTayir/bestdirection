import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit, apiLimiter } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(apiLimiter, request);
  if (rateLimitResponse) return rateLimitResponse;

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
