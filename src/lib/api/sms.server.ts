import "server-only";
import type { ApiSmsTemplate } from "./sms";
import { apiServerFetch } from "./server";

// Те же маршруты СМС для серверных компонентов.

export interface ApiSmsAccount {
  name: string;
  role: string;
  status: string;
  balance: number;
  /** role: "test" — шлюз примет только номера, привязанные к аккаунту. */
  isTestMode: boolean;
}

export interface ApiSmsLogEntry {
  id: string;
  phone: string;
  text: string;
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
  parts: number;
  price: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
  user: { firstName: string; lastName: string } | null;
}

export interface ApiSmsBroadcast {
  id: string;
  total: number;
  createdAt: string;
  group: { name: string } | null;
  template: { title: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  _count: { messages: number };
}

export const getSmsAccount = () => apiServerFetch<ApiSmsAccount | null>("/sms/account");

export const getSmsTemplates = () => apiServerFetch<ApiSmsTemplate[]>("/sms/templates");

export const getSmsLog = (limit = 50) =>
  apiServerFetch<{
    messages: ApiSmsLogEntry[];
    broadcasts: ApiSmsBroadcast[];
    delivered: { broadcastId: string | null; status: string; _count: number }[];
  }>("/sms/log", { query: { limit } });
