import "server-only";
import type { ApiPayoutsPage, ApiSalaryOverview, ApiTeacherSalary } from "./salary";
import { apiServerFetch } from "./server";

// Те же маршруты salary для серверных компонентов, см. billing.server.

export const getSalaryOverview = (query: { month?: string; branchId?: string } = {}) =>
  apiServerFetch<ApiSalaryOverview>("/salary", { query });

export const getTeacherSalary = (teacherId: string, query: { month?: string } = {}) =>
  apiServerFetch<ApiTeacherSalary>(`/salary/${teacherId}`, { query });

export const getMySalary = (query: { month?: string } = {}) => apiServerFetch<ApiTeacherSalary>("/salary/me", { query });

export const getSalaryPayouts = (query: { month?: string; teacherId?: string; branchId?: string } = {}) =>
  apiServerFetch<ApiPayoutsPage>("/salary/payouts", { query });

export const getPayoutTeacherOptions = () =>
  apiServerFetch<{ id: string; firstName: string; lastName: string }[]>("/salary/payouts/teachers");
