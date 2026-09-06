export const MARKETING_DOMAIN = process.env.MARKETING_DOMAIN || "bestdirection.uz";

// Адрес CRM для ссылок «Личный кабинет» на лендинге. NEXTAUTH_URL уже указывает на
// домен CRM конкретного сервера.
export const LMS_URL = process.env.NEXTAUTH_URL || "https://crm.bestdirection.uz";

// Independent from the CRM's own defaultLocale ('ru') — the landing defaults to Uzbek
// when no /ru or /uz prefix is present in the URL.
export const MARKETING_DEFAULT_LOCALE = "uz";

export function isMarketingHost(host: string): boolean {
  const bareHost = host.split(":")[0];
  return bareHost === MARKETING_DOMAIN || bareHost === `www.${MARKETING_DOMAIN}`;
}
