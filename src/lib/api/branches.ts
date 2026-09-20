import { apiFetch } from "./client";
import type { ApiResult } from "./result";

// Модуль branches в api: справочник филиалов (этап 1 плана 2026-09-20).

export interface ApiBranch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BranchInput {
  name?: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
  sortOrder?: number;
}

// ---------- браузер ----------

export const createBranch = (body: BranchInput & { name: string }): Promise<ApiResult<ApiBranch>> =>
  apiFetch("/branches", { method: "POST", body });

export const updateBranch = (id: string, body: BranchInput): Promise<ApiResult<ApiBranch>> =>
  apiFetch(`/branches/${id}`, { method: "PATCH", body });

export const deleteBranch = (id: string) => apiFetch<{ id: string }>(`/branches/${id}`, { method: "DELETE" });
