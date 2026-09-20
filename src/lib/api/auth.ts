import { apiFetch } from "./client";

// Вход и восстановление пароля. Сессию заводит api и ставит куку сам —
// браузеру остаётся перейти на нужную страницу. Самостоятельная регистрация
// и почтовый сброс пароля убраны целиком (шаг 2 отказа от почты): учеников
// заводит администратор, Telegram — единственный самостоятельный путь
// восстановления.

export interface AuthUser {
  id: string;
  role: string;
  login: string | null;
  firstName: string;
  lastName: string;
}

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

// Единственный самостоятельный путь сброса пароля после ухода почты (шаг 2
// отказа от почты): код приходит в Telegram. Тот же нейтральный { ok: true }
// на неизвестный логин и на логин без привязанного Telegram.
export const requestTelegramPasswordReset = (login: string) =>
  apiFetch<{ ok: true }>("/auth/password/telegram/request-code", { method: "POST", body: { login } });

export const resetPasswordViaTelegram = (body: { login: string; code: string; newPassword: string }) =>
  apiFetch<{ ok: true }>("/auth/password/telegram/reset", { method: "POST", body });
