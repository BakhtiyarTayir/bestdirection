import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

const ALLOWED_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov"];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимальный размер: 500 МБ" },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Видеофайл не найден" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимальный размер: 500 МБ" },
        { status: 413 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Недопустимый формат файла. Разрешены: MP4, WebM, OGG, MOV" },
        { status: 400 }
      );
    }

    // Validate file extension
    const originalName = file.name;
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Недопустимое расширение файла. Разрешены: .mp4, .webm, .ogg, .mov" },
        { status: 400 }
      );
    }
    const safeExt = ext || ".mp4";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${safeExt}`;

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "videos");
    await mkdir(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, uniqueName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const url = `/uploads/videos/${uniqueName}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Video upload error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить видео" },
      { status: 500 }
    );
  }
}
