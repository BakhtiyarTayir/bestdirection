import type { Role } from "@/validators/user";
import { apiFetch } from "./client";
import type { ApiResult } from "./result";

// Типы ответов модуля users в api и вызовы из браузера. Типы пишутся руками,
// пока api не публикует OpenAPI; даты приходят строками ISO — форматтеры в web
// их принимают.
//
// Серверные компоненты берут те же маршруты из ./users.server: тот модуль тянет
// next/headers, и в клиентском бандле ему делать нечего.

export interface ApiUser {
  id: string;
  number: number;
  // Логин заменяет почту как опознавательный знак при входе (шаг 1 отказа от
  // почты); почта остаётся в шаге 1, только больше не показывается в UI
  login: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Приписка справочная — настоящая привязка ученика к филиалу идёт через
  // группу (ловушка 3.8.5 плана филиалов)
  branchId: string | null;
  branch: { id: string; name: string } | null;
  // Для кнопки «Написать в Telegram» на карточках других людей (4.2)
  telegramUsername: string | null;
}

export interface ApiDeactivatedUser {
  id: string;
  number: number;
  email: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  telegramChatId: string | null;
}

export interface ApiTeacher {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  telegramUsername: string | null;
  groups: { id: string; name: string; courseTitle: string; studentCount: number }[];
  courses: { id: string; title: string; slug: string }[];
  studentCount: number;
}

export interface ApiProfile {
  id: string;
  login: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
}

export type HomeworkSubmissionState = "ALL" | "PASSED" | "FAILED" | "NOT_SUBMITTED";

export interface ApiHomeworkStatistics {
  courses: { id: string; title: string; slug: string }[];
  homeworks: {
    id: string;
    title: string;
    passingScore: number;
    requiresManualReview: boolean;
    lesson: { title: string };
  }[];
  groups: { id: string; name: string }[];
  summary: {
    totalStudents: number;
    passedCount: number;
    failedCount: number;
    notSubmittedCount: number;
    averageBestPercent: number;
    onlineNowCount: number;
  };
  rows: {
    studentId: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
    isOnlineNow: boolean;
    groupId: string | null;
    groupName: string | null;
    attempts: number;
    bestPercent: number;
    submissionState: Exclude<HomeworkSubmissionState, "ALL">;
    hasSubmission: boolean;
    lastSubmittedAt: string | null;
  }[];
}

export interface ApiAuditLogPage {
  logs: {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    changes: Record<string, { old: unknown; new: unknown }> | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    user: { id: string; firstName: string; lastName: string; email: string | null };
  }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiTelegramStatus {
  isLinked: boolean;
  username: string | null;
}

/** Курсы и группы для блока «Обучение» в форме создания ученика (4.4). */
export interface ApiUsersFormOptions {
  courses: { id: string; title: string; price: number | null }[];
  groups: { id: string; name: string; price: number | null; courseId: string; branchId: string }[];
}

// ---------- браузер ----------

export const createUser = (body: {
  login: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  branchId: string;
  enrollment?: {
    courseId: string;
    groupId?: string;
    priceOverride?: number;
    startsAt?: string;
    firstMonthCharge?: number;
  };
}): Promise<ApiResult<ApiUser & { enrollmentId: string | null }>> => apiFetch("/users", { method: "POST", body });

export const updateUser = (
  id: string,
  body: {
    email?: string;
    login?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role?: Role;
    isActive?: boolean;
    branchId?: string;
  }
): Promise<ApiResult<ApiUser>> => apiFetch(`/users/${id}`, { method: "PATCH", body });

export const suggestLogin = (body: { firstName: string; lastName: string }) =>
  apiFetch<{ login: string }>("/users/login-suggestion", { method: "POST", body });

export const checkLoginAvailable = (login: string) =>
  apiFetch<{ available: boolean }>("/users/login-available", { query: { login } });

export const deactivateUser = (id: string) => apiFetch<{ ok: true }>(`/users/${id}/deactivate`, { method: "POST" });
export const restoreUser = (id: string) => apiFetch<{ ok: true }>(`/users/${id}/restore`, { method: "POST" });
export const purgeUser = (id: string) => apiFetch<{ ok: true }>(`/users/${id}`, { method: "DELETE" });

export const updateProfile = (body: { firstName: string; lastName: string; phone?: string }) =>
  apiFetch<ApiProfile>("/me/profile", { method: "PATCH", body });

export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  apiFetch<{ ok: true }>("/me/password", { method: "POST", body });

export const getTelegramStatus = () => apiFetch<ApiTelegramStatus>("/me/telegram");
export const generateTelegramLinkCode = () => apiFetch<{ code: string }>("/me/telegram/code", { method: "POST" });
export const unlinkTelegram = () => apiFetch<{ ok: true }>("/me/telegram", { method: "DELETE" });
