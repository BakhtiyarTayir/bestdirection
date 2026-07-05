import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

const redis = createRedis();

function createLimiter(
  requests: number,
  window: `${number} s` | `${number} m`
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: false,
  });
}

export const authLimiter = createLimiter(5, "60 s");
export const apiLimiter = createLimiter(30, "60 s");
export const uploadLimiter = createLimiter(5, "60 s");
export const leadLimiter = createLimiter(3, "60 s");

export function getClientIp(request: { headers: Pick<Headers, "get"> }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "anonymous";
}

export async function applyRateLimit(
  limiter: Ratelimit | null,
  request: NextRequest
): Promise<NextResponse | null> {
  if (!limiter) return null;

  try {
    const ip = getClientIp(request);
    const { success, limit, remaining, reset } = await limiter.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      );
    }
  } catch {
    // Graceful fallback: if Redis is unavailable, allow the request
  }

  return null;
}

export async function isWithinRateLimit(
  limiter: Ratelimit | null,
  ip: string
): Promise<boolean> {
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit(ip);
    return success;
  } catch {
    // Graceful fallback: if Redis is unavailable, allow the request
    return true;
  }
}
