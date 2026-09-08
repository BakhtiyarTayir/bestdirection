import { prisma } from "@/lib/prisma";

/**
 * Клиент SMS-шлюза eskiz.uz.
 *
 * Токен выдаётся по email и паролю и живёт около месяца. Держим его в БД,
 * а не в памяти процесса: контейнер перезапускается на каждом деплое, и
 * логин уходил бы заново при каждом старте.
 *
 * Документация: https://documenter.getpostman.com/view/663428/RzfmES4z
 */

const BASE = "https://notify.eskiz.uz/api";
const PROVIDER = "eskiz";

// Токен живёт ~30 дней; обновляем заранее, чтобы не поймать 401 на рассылке
const TOKEN_TTL_DAYS = 25;

export interface EskizSendResult {
  id: string;
  status: string;
}

export class EskizError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "EskizError";
  }
}

export function isEskizConfigured(): boolean {
  return Boolean(process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD);
}

// ─── Токен ────────────────────────────────────────────────────────────────

async function login(): Promise<string> {
  const email = process.env.ESKIZ_EMAIL;
  const password = process.env.ESKIZ_PASSWORD;
  if (!email || !password) throw new EskizError("ESKIZ_EMAIL yoki ESKIZ_PASSWORD ko'rsatilmagan");

  const body = new FormData();
  body.append("email", email);
  body.append("password", password);

  const res = await fetch(`${BASE}/auth/login`, { method: "POST", body });
  if (!res.ok) {
    throw new EskizError(`Eskizga kirib bo'lmadi: HTTP ${res.status}`, res.status);
  }

  const json = (await res.json()) as { data?: { token?: string } };
  const token = json.data?.token;
  if (!token) throw new EskizError("Eskiz token qaytarmadi");

  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.integrationToken.upsert({
    where: { provider: PROVIDER },
    create: { provider: PROVIDER, token, expiresAt },
    update: { token, expiresAt },
  });

  return token;
}

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const stored = await prisma.integrationToken.findUnique({ where: { provider: PROVIDER } });
    if (stored && stored.expiresAt > new Date()) return stored.token;
  }
  return login();
}

/**
 * Запрос с токеном. При 401 один раз перелогинивается и повторяет: токен
 * могли отозвать в кабинете, и падать из-за этого посреди рассылки незачем.
 */
async function authed(
  path: string,
  init: RequestInit = {},
  retried = false
): Promise<Response> {
  const token = await getToken(retried);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && !retried) return authed(path, init, true);
  return res;
}

// ─── Публичные методы ─────────────────────────────────────────────────────

/** Остаток на счёте в сумах. */
export async function getBalance(): Promise<number> {
  const res = await authed("/user/get-limit");
  if (!res.ok) throw new EskizError(`Balansni olib bo'lmadi: HTTP ${res.status}`, res.status);
  const json = (await res.json()) as { data?: { balance?: number } };
  return json.data?.balance ?? 0;
}

/** Сведения об аккаунте: имя, статус и роль — по роли видно, боевой ли режим. */
export async function getAccount(): Promise<{
  name: string;
  role: string;
  status: string;
  balance: number;
}> {
  const res = await authed("/auth/user");
  if (!res.ok) throw new EskizError(`Hisob ma'lumotlarini olib bo'lmadi: HTTP ${res.status}`, res.status);
  const json = (await res.json()) as {
    data?: { name?: string; role?: string; status?: string; balance?: number };
  };
  return {
    name: json.data?.name ?? "",
    role: json.data?.role ?? "",
    status: json.data?.status ?? "",
    balance: json.data?.balance ?? 0,
  };
}

/** Одно сообщение. Телефон должен быть уже нормализован в 998XXXXXXXXX. */
export async function sendOne(params: {
  phone: string;
  text: string;
  userSmsId?: string;
  callbackUrl?: string;
}): Promise<EskizSendResult> {
  const body = new FormData();
  body.append("mobile_phone", params.phone);
  body.append("message", params.text);
  body.append("from", process.env.ESKIZ_FROM || "4546");
  if (params.userSmsId) body.append("user_sms_id", params.userSmsId);
  if (params.callbackUrl) body.append("callback_url", params.callbackUrl);

  const res = await authed("/message/sms/send", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    message?: string;
  };

  if (!res.ok || !json.id) {
    throw new EskizError(json.message || `Yuborish rad etildi: HTTP ${res.status}`, res.status);
  }
  return { id: json.id, status: json.status ?? "waiting" };
}

/**
 * Пакетная отправка: один запрос на всю рассылку вместо N отдельных.
 * user_sms_id связывает каждое сообщение с нашей строкой журнала — без него
 * в рассылке на тридцать человек не понять, кому не дошло.
 */
export async function sendBatch(params: {
  messages: { userSmsId: string; phone: string; text: string }[];
  dispatchId: string;
  callbackUrl?: string;
}): Promise<{ id: string }> {
  const res = await authed("/message/sms/send-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages.map((m) => ({
        user_sms_id: m.userSmsId,
        to: m.phone,
        text: m.text,
      })),
      from: process.env.ESKIZ_FROM || "4546",
      dispatch_id: params.dispatchId,
      callback_url: params.callbackUrl ?? "",
    }),
  });

  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    throw new EskizError(json.message || `Ommaviy yuborish rad etildi: HTTP ${res.status}`, res.status);
  }
  return { id: json.id ?? params.dispatchId };
}

/** Статус доставки одного сообщения по id, выданному шлюзом. */
export async function getMessageStatus(providerId: string): Promise<{
  status: string;
  price?: number;
} | null> {
  const res = await authed(`/message/sms/status_by_id/${providerId}`);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as {
    data?: { status?: string; price?: number } | { status?: string; price?: number }[];
  };
  const row = Array.isArray(json.data) ? json.data[0] : json.data;
  if (!row?.status) return null;
  return { status: row.status, price: row.price };
}

/** Шаблоны аккаунта — источник согласованных текстов для платформы. */
export async function listTemplates(): Promise<
  { id: number; template: string; original_text: string; status: string }[]
> {
  const res = await authed("/user/templates");
  if (!res.ok) throw new EskizError(`Shablonlarni olib bo'lmadi: HTTP ${res.status}`, res.status);
  const json = (await res.json().catch(() => ({}))) as {
    result?: { id: number; template: string; original_text: string; status: string }[];
  };
  return json.result ?? [];
}

/** Подать шаблон на модерацию, не заходя в кабинет Eskiz. */
export async function submitTemplate(text: string): Promise<void> {
  const body = new FormData();
  body.append("template", text);
  const res = await authed("/user/template", { method: "POST", body });
  if (!res.ok) {
    throw new EskizError(`Shablonni yuborib bo'lmadi: HTTP ${res.status}`, res.status);
  }
}
