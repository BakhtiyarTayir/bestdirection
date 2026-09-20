import "server-only";
import { apiServerFetch } from "./server";

// Сводка на главной кабинета: состав зависит от роли вызывающего.

export type ApiDashboardSummary =
  | { role: "ADMIN"; users: number; courses: number; students: number; teachers: number }
  | { role: "TEACHER"; courses: number; students: number }
  | { role: "STUDENT"; courses: number; tests: number };

export const getDashboardSummary = () =>
  apiServerFetch<ApiDashboardSummary>("/dashboard/summary");

/** slug-адрес → идентификаторы. Недоступное api отдаёт как несуществующее. */
export const resolvePath = (params: {
  courseSlug: string;
  lessonSlug?: string;
  homeworkSlug?: string;
}) =>
  apiServerFetch<{ courseId: string; lessonId?: string; homeworkId?: string }>("/paths/resolve", {
    query: params,
  });
