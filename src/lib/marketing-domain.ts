export const MARKETING_DOMAIN = process.env.MARKETING_DOMAIN || "uportal.uz";

// Independent from the LMS's own defaultLocale ('ru') — the landing defaults to Uzbek
// when no /ru or /uz prefix is present in the URL.
export const MARKETING_DEFAULT_LOCALE = "uz";

export function isMarketingHost(host: string): boolean {
  const bareHost = host.split(":")[0];
  return bareHost === MARKETING_DOMAIN || bareHost === `www.${MARKETING_DOMAIN}`;
}
