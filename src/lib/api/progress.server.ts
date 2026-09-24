import "server-only";
import type { ApiProgress } from "./progress";
import { apiServerFetch } from "./server";

export const getProgress = (studentId: string, month?: string) =>
  apiServerFetch<ApiProgress>(`/progress/students/${studentId}`, { query: { month } });
