import { apiFetch } from "./client";

// Вход, регистрация и восстановление пароля. Сессию заводит api и ставит
// куку сам — браузеру остаётся перейти на нужную страницу.

export interface AuthUser {
  id: string;
  role: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

export const loginWithPassword = (email: string, password: string) =>
  apiFetch<{ user: AuthUser }>("/auth/login", { method: "POST", body: { email, password } });

export const loginWithTelegramWidget = (payload: Record<string, string>) =>
  apiFetch<{ user: AuthUser }>("/auth/telegram/widget", { method: "POST", body: payload });

export const loginWithTelegramCode = (code: string) =>
  apiFetch<{ user: AuthUser }>("/auth/telegram/code", { method: "POST", body: { code } });

export const createTelegramLoginRequest = () =>
  apiFetch<{ code: string }>("/auth/telegram/request", { method: "POST" });

export const getTelegramLoginStatus = (code: string) =>
  apiFetch<{ status: "PENDING" | "CONFIRMED" | "EXPIRED" }>("/auth/telegram/status", {
    query: { code },
  });

export const getTelegramBotUsername = () =>
  apiFetch<{ username: string | null }>("/auth/telegram/bot");

export const logout = () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });

export const requestEmailCode = (email: string, locale?: string) =>
  apiFetch<{ ok: true }>("/auth/email/request-code", { method: "POST", body: { email, locale } });

export const verifyEmailCode = (email: string, code: string) =>
  apiFetch<{ ok: true }>("/auth/email/verify-code", { method: "POST", body: { email, code } });

export const registerUser = (body: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  code: string;
}) => apiFetch<{ id: string }>("/auth/register", { method: "POST", body });

export const requestPasswordReset = (email: string, locale?: string) =>
  apiFetch<{ ok: true }>("/auth/password/request-reset", {
    method: "POST",
    body: { email, locale },
  });

export const resetPassword = (body: { email: string; code: string; newPassword: string }) =>
  apiFetch<{ ok: true }>("/auth/password/reset", { method: "POST", body });
