import { Injectable } from "@nestjs/common";
import { diskStorage } from "multer";
import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";

/** Картинки — обложки курсов и лендинга. */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Видео урока. Решение владельца от 2026-09-18: 200 МБ. Файл пишется на диск
 * потоком (multer), поэтому память контейнера от размера не зависит — раньше
 * 500 МБ читались в память при лимите контейнера 512 МБ (аудит 4.1).
 */
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

/** Работа ученика. */
export const MAX_SUBMISSION_SIZE = 5 * 1024 * 1024;

export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".mov"]);

// Без .html и .svg: браузер исполняет их скрипты. Выдача и так отдаёт такие
// файлы вложением, но принимать их незачем.
export const SUBMISSION_EXTENSIONS = new Set([
  ".py", ".js", ".ts", ".jsx", ".tsx", ".php", ".java", ".cs", ".cpp", ".c",
  ".h", ".css", ".sql", ".json", ".txt", ".md", ".ipynb",
  ".zip", ".rar", ".7z", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
]);

export type UploadKind = "images" | "videos" | "homework";

/**
 * Каталоги загрузок читаются из окружения здесь, а не через провайдер ENV:
 * хранилище multer задаётся в декораторе, когда внедрения ещё нет. Значения
 * те же, что проверяет схема окружения (api/src/config/env.ts) — публичные
 * картинки и видео лежат на одном томе с web, работы учеников на другом.
 */
export function uploadDir(kind: UploadKind) {
  const publicDir = process.env.PUBLIC_UPLOAD_DIR ?? "/app/public/uploads";
  const privateDir = process.env.PRIVATE_UPLOAD_DIR ?? "/app/uploads";
  return kind === "homework" ? join(privateDir, "homework") : join(publicDir, kind);
}

/** Имя на диске задаём сами: присланному доверять нельзя. */
function uniqueName(originalName: string) {
  const ext = extname(originalName).toLowerCase();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
}

/**
 * Хранилище multer: файл пишется сразу на диск, минуя память процесса.
 * Каталог создаётся синхронно — multer вызывает destination до записи.
 */
export function diskStorageIn(kind: UploadKind) {
  return diskStorage({
    destination: (_req, _file, callback) => {
      const target = uploadDir(kind);
      mkdirSync(target, { recursive: true });
      callback(null, target);
    },
    filename: (_req, file, callback) => callback(null, uniqueName(file.originalname)),
  });
}

@Injectable()
export class UploadsService {
  /** Публичный адрес файла, как он лежит в базе: /uploads/<вид>/<имя>. */
  publicUrl(kind: "images" | "videos", filename: string) {
    return `/uploads/${kind}/${filename}`;
  }

  dir(kind: UploadKind) {
    return uploadDir(kind);
  }
}
