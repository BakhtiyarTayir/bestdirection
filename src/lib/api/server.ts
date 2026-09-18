import "server-only";
import { cookies } from "next/headers";
import { buildPath, toResult, type ApiRequestInit, type ApiResult } from "./result";

const INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://api:4000";

/**
 * Вызов api из серверных компонентов — по внутренней сети, мимо Caddy.
 * Кука пользователя пробрасывается как есть, а внутренний токен заменяет
 * заголовок Origin, которого у серверного запроса нет (см. OriginGuard).
 */
export async function apiServerFetch<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
  const { method = "GET", body, query } = init;
  const cookieHeader = (await cookies()).toString();

  let response: Response;
  try {
    response = await fetch(`${INTERNAL_URL}${buildPath(path, query)}`, {
      method,
      // Страницы кабинета динамические: ответы api не кэшируем
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
        ...(process.env.INTERNAL_TOKEN ? { "x-internal-token": process.env.INTERNAL_TOKEN } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { success: false, error: "somethingWentWrong" };
  }

  return toResult<T>(response);
}
