import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { applyRateLimit, authLimiter } from "@/lib/rate-limit";

const { GET, POST: originalPost } = handlers;

async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(authLimiter, request);
  if (rateLimitResponse) return rateLimitResponse;

  return originalPost(request);
}

export { GET, POST };
