import "server-only";
import type { ApiFinance } from "./finance";
import { apiServerFetch } from "./server";

export const getFinance = (query: { month?: string; branchId?: string } = {}) =>
  apiServerFetch<ApiFinance>("/finance", { query });
