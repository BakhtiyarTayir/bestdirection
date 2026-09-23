import "server-only";
import type { ApiAdminDashboard, ApiDashboardSummary } from "./dashboard";
import { apiServerFetch } from "./server";

// Сводка на главной кабинета: состав зависит от роли вызывающего.

export const getDashboardSummary = () =>
  apiServerFetch<ApiDashboardSummary>("/dashboard/summary");

/** Главная панель администратора (план дашборда, раздел 1). */
export const getAdminDashboard = (branchId?: string) =>
  apiServerFetch<ApiAdminDashboard>("/dashboard/admin", { query: { branchId } });

/** slug-адрес → идентификаторы. Недоступное api отдаёт как несуществующее. */
export const resolvePath = (params: {
  courseSlug: string;
  lessonSlug?: string;
  homeworkSlug?: string;
}) =>
  apiServerFetch<{ courseId: string; lessonId?: string; homeworkId?: string }>("/paths/resolve", {
    query: params,
  });
