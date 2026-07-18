import { headers } from "next/headers";

// In-memory sliding-window лимитер для публичных server actions.
// Прод работает в одном контейнере, поэтому память процесса — адекватное
// хранилище; при появлении нескольких инстансов заменить на Redis
// (см. src/lib/rate-limit.ts с Upstash).

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

/**
 * true — запрос в пределах лимита; false — превышен.
 * bucket разделяет счётчики разных actions.
 */
export async function checkActionRateLimit(
  bucket: string,
  limit: number,
  windowMs = 60_000
): Promise<boolean> {
  const ip = await getClientIpFromHeaders();
  const key = `${bucket}:${ip}`;
  const now = Date.now();

  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  buckets.set(key, timestamps);

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  return true;
}
