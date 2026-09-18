import { apiFetch } from "./client";

// Модуль уведомлений в api: шаблоны и рассылки СМС. Серверные компоненты
// берут те же маршруты из ./sms.server.

export type SmsTemplateStatus = "DRAFT" | "MODERATION" | "APPROVED" | "REJECTED";

export interface ApiSmsTemplate {
  id: string;
  eskizId: number | null;
  title: string;
  textRu: string;
  textUz: string;
  status: SmsTemplateStatus;
  syncedAt: string | null;
  createdAt: string;
}

export interface ApiBroadcastRecipient {
  parentId: string;
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  children: string[];
  text: string;
  parts: number;
  unicode: boolean;
  unresolved: string[];
}

export interface ApiBroadcastPlan {
  groupName: string;
  templateStatus: SmsTemplateStatus;
  recipients: ApiBroadcastRecipient[];
  sendableCount: number;
  skipped: ApiBroadcastRecipient[];
  withoutPhoneCount: number;
  studentCount: number;
  totalParts: number;
  estimatedCost: number;
}

export const syncSmsTemplates = () =>
  apiFetch<{ created: number; updated: number }>("/sms/templates/sync", { method: "POST" });

export const createSmsTemplate = (body: {
  title: string;
  textRu: string;
  textUz: string;
  submitToEskiz?: boolean;
}) => apiFetch<{ id: string; submitError: string | null }>("/sms/templates", { method: "POST", body });

export const previewBroadcast = (body: {
  groupId: string;
  templateId: string;
  locale?: "ru" | "uz";
  values?: Record<string, string>;
}) => apiFetch<ApiBroadcastPlan>("/sms/broadcast/preview", { method: "POST", body });

export const sendBroadcast = (body: {
  groupId: string;
  templateId: string;
  locale?: "ru" | "uz";
  values?: Record<string, string>;
}) => apiFetch<{ broadcastId: string; sent: number }>("/sms/broadcast", { method: "POST", body });
