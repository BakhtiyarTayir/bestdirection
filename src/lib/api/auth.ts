import { apiFetch } from "./client";

// Вход, регистрация и восстановление пароля. Сессию заводит api и ставит
// куку сам — браузеру остаётся перейти на нужную страницу.

export interface AuthUser {
  id: string;
  role: string;
  login: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
}

// Параметр называется login, но принимает и старую почту (шаг 1 отказа от
// почты) — сервер сам решает по значению, что это. Имя параметра не меняем:
// (auth)/register вызывает эту же функцию с адресом почты.
export const loginWithPassword = (login: string, password: string) =>
  apiFetch<{ user: AuthUser }>("/auth/login", { method: "POST", body: { login, password } });

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

// Второй, независимый от почты путь сброса пароля: код приходит в Telegram,
// а не на почту (шаг 1 отказа от почты). Тот же нейтральный { ok: true } на
// неизвестный логин и на логин без привязанного Telegram.
export const requestTelegramPasswordReset = (login: string) =>
  apiFetch<{ ok: true }>("/auth/password/telegram/request-code", { method: "POST", body: { login } });

export const resetPasswordViaTelegram = (body: { login: string; code: string; newPassword: string }) =>
  apiFetch<{ ok: true }>("/auth/password/telegram/reset", { method: "POST", body });
