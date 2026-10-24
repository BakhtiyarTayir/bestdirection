import "server-only";
import type { ApiFinance, ApiProfitHandovers } from "./finance";
import { apiServerFetch } from "./server";

export const getFinance = (query: { month?: string; branchId?: string } = {}) =>
  apiServerFetch<ApiFinance>("/finance", { query });

export const getHandovers = (query: { month: string; branchId?: string }) =>
  apiServerFetch<ApiProfitHandovers>("/finance/handovers", { query });
