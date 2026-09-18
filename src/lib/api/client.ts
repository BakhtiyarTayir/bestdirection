import { API_PREFIX, buildPath, toResult, type ApiRequestInit, type ApiResult } from "./result";

/**
 * Вызов api из браузера. Адрес относительный, поэтому кука уходит сама, а
 * заголовок Origin браузер ставит сам — его сверяет OriginGuard в api.
 *
 * В проде на /api/v2/* отвечает Caddy, в разработке — rewrite из next.config.ts.
 */
export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
  const { method = "GET", body, query } = init;

  let response: Response;
  try {
    response = await fetch(buildPath(path, query), {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Нет сети или api не отвечает — для интерфейса это обычная ошибка действия
    return { success: false, error: "somethingWentWrong" };
  }

  return toResult<T>(response);
}

/**
 * Загрузка файла: multipart, поле file. Content-Type ставит браузер сам —
 * задать его руками нельзя, иначе потеряется граница частей.
 */
export async function apiUpload<T>(path: string, file: File): Promise<ApiResult<T>> {
  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method: "POST",
      credentials: "same-origin",
      body,
    });
  } catch {
    return { success: false, error: "somethingWentWrong" };
  }

  return toResult<T>(response);
}
