// Копия в web живёт только ради Telegram-бота: сам разбор файлов работ
// уехал в api на этапе 5 (api/src/common/submission-files.ts). Уйдёт вместе
// с ботом на этапе 6.
import path from "path";

// Файлы работ студентов отдаются с домена CRM, а имя файла и тип из
// multipart-запроса (или из Telegram) задаёт сам студент. Поэтому тип выводится
// только из расширения по белому списку, а всё, что браузер мог бы исполнить,
// уходит вложением. Иначе solution.html с Content-Type: text/html открылся бы у
// преподавателя на домене CRM и действовал бы от его имени.

/** Что безопасно открыть прямо во вкладке: браузер это показывает, а не исполняет. */
const INLINE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function extensionOf(filename: string) {
  return path.extname(filename).toLowerCase();
}

/** Тип для SubmissionFile.mimeType. Присланному клиентом типу не доверяем. */
export function submissionMimeType(filename: string): string {
  return INLINE_TYPES[extensionOf(filename)] ?? "application/octet-stream";
}

/**
 * Content-Disposition с именем файла. Кавычка или перевод строки в имени
 * ломали заголовок, а кириллица в filename="..." портится: оригинальное имя
 * идёт в filename*, в filename — ASCII-замена для старых клиентов.
 */
function contentDisposition(type: "inline" | "attachment", filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Заголовки ответа с файлом работы. download: true — всегда скачивание. */
export function submissionFileHeaders(
  file: { filename: string; size: number },
  { download }: { download: boolean }
): Record<string, string> {
  const inlineType = download ? undefined : INLINE_TYPES[extensionOf(file.filename)];
  return {
    "Content-Type": inlineType ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(inlineType ? "inline" : "attachment", file.filename),
    "Content-Length": file.size.toString(),
    "X-Content-Type-Options": "nosniff",
  };
}
