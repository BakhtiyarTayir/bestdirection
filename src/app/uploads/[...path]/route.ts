import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

// Next.js в production (output: standalone) отдаёт статикой из public/ только
// файлы, которые существовали на момент СБОРКИ. Загруженные в рантайм обложки
// и видео (public/uploads/...) в этот снимок не попадают и отдаются как 404.
// Этот роут читает их с диска напрямую, минуя статический слой.
// Старые файлы, запечённые в образ при сборке, продолжает отдавать статика
// (она имеет приоритет), новые — попадают сюда.

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // Приватные работы студентов сюда не отдаём (лежат в отдельном томе,
  // доступ только через авторизованный /api/files/[fileId]).
  if (segments[0] === "homework") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(segments[segments.length - 1] ?? "").toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Защита от path traversal: собранный путь обязан остаться внутри UPLOADS_DIR.
  const filePath = path.join(UPLOADS_DIR, ...segments);
  if (filePath !== UPLOADS_DIR && !filePath.startsWith(UPLOADS_DIR + path.sep)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const content = await readFile(filePath);
    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": info.size.toString(),
        // Имена файлов уникальны (timestamp + random), содержимое неизменно.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
