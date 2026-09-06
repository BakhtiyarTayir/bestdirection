/**
 * Исходный Host запроса, проставляется в src/proxy.ts при rewrite на лендинг.
 * Нужен потому, что Next перезапускает proxy на внутреннем rewrite и подменяет
 * заголовок Host на localhost — по нему домен лендинга уже не опознать.
 */
export const MARKETING_HOST_HEADER = "x-marketing-host";

export const MARKETING_DOMAIN = process.env.MARKETING_DOMAIN || "best-direction.uz";

// Адрес CRM для ссылок «Личный кабинет» на лендинге. NEXTAUTH_URL уже указывает на
// домен CRM конкретного сервера.
export const LMS_URL = process.env.NEXTAUTH_URL || "https://crm.best-direction.uz";

// Independent from the CRM's own defaultLocale ('ru') — the landing defaults to Uzbek
// when no /ru or /uz prefix is present in the URL.
export const MARKETING_DEFAULT_LOCALE = "uz";

/**
 * Локальный ли Host. Внутренний проход после rewrite приходит именно с таким,
 * внешний запрос — всегда с публичным доменом (его проставляет reverse-proxy).
 */
export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const bareHost = host.split(":")[0];
  return bareHost === "localhost" || bareHost === "127.0.0.1" || bareHost === "[::1]";
}

export function isMarketingHost(host: string): boolean {
  const bareHost = host.split(":")[0];
  return bareHost === MARKETING_DOMAIN || bareHost === `www.${MARKETING_DOMAIN}`;
}
