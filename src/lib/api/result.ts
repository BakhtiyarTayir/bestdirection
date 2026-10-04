/**
 * Ответ api в том же виде, в каком его отдавали server actions:
 * { success: true, data } либо { success: false, error: "<ключ перевода>" }.
 * Формат сохранён намеренно — компоненты при переносе модуля меняют только
 * импорт, а обработка ошибок и переводы остаются прежними.
 */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

export const API_PREFIX = "/api/v2";

export type ApiRequestInit = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Параметры запроса; undefined и пустые строки не отправляются. */
  query?: Record<string, string | number | undefined>;
};

export function buildPath(path: string, query?: ApiRequestInit["query"]): string {
  if (!query) return `${API_PREFIX}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const queryString = params.toString();
  return `${API_PREFIX}${path}${queryString ? `?${queryString}` : ""}`;
}

/** Ответ api → ApiResult. Ключ ошибки берётся из message, тело 204 — как null. */
export async function toResult<T>(response: Response): Promise<ApiResult<T>> {
  const text = await response.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : "somethingWentWrong";
    // details api отдаёт только там, где сервис объясняет отказ подробно
    const details = parsed && typeof parsed === "object" ? (parsed as { details?: unknown }).details : undefined;
    return { success: false, error: message, ...(details !== undefined && { details }) };
  }

  return { success: true, data: parsed as T };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
