import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "crypto";

/**
 * Сброс кэша лендинга по просьбе api.
 *
 * Контент лендинга правит api, а кэширует его Next.js по тегу — сам он об
 * изменении не узнает. Маршрут внутренний: снаружи не вызывается, защищён
 * тем же общим секретом, что и серверные вызовы web → api.
 */
const ALLOWED_TAGS = new Set(["marketing"]);

function isValidToken(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // Сравнение постоянного времени: иначе секрет подбирается по задержке
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isValidToken(request.headers.get("x-internal-token"), process.env.INTERNAL_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { tag?: string };
  const tag = body.tag ?? "";
  if (!ALLOWED_TAGS.has(tag)) {
    return NextResponse.json({ error: "Unknown tag" }, { status: 400 });
  }

  // Именно revalidateTag: updateTag работает только внутри серверного
  // действия и в маршруте падает с ошибкой. Второй аргумент — профиль
  // кэша: "max" помечает тег устаревшим сразу.
  revalidateTag(tag, "max");
  return NextResponse.json({ ok: true });
}
