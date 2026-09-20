import "server-only";
import { cache } from "react";
import { apiServerFetch } from "@/lib/api/server";

/**
 * Кто вошёл. Сессию держит api: здесь только запрос «кто я» с кукой из
 * текущего запроса. Обёрнут в cache — страница спрашивает сессию в нескольких
 * местах, а запрос нужен один на рендер.
 */
export interface SessionUser {
  id: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";
  login: string | null;
  firstName: string;
  lastName: string;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const result = await apiServerFetch<SessionUser>("/auth/me");
  return result.success ? result.data : null;
});

/** Форма как у прежнего auth() из NextAuth: страницы читают session.user. */
export const getSession = cache(async (): Promise<{ user: SessionUser } | null> => {
  const user = await getSessionUser();
  return user ? { user } : null;
});
