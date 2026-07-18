import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale, localePrefix } from "./i18n/config";
import { isMarketingHost, MARKETING_DEFAULT_LOCALE } from "./lib/marketing-domain";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
});

export function proxy(request: NextRequest) {
  // Работы студентов не раздаются статикой: доступ только через
  // авторизованный /api/files/[fileId] (защита оставшихся в public файлов)
  if (request.nextUrl.pathname.startsWith("/uploads/homework/")) {
    return new NextResponse(null, { status: 404 });
  }

  if (request.nextUrl.pathname.startsWith("/api")) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  const rewriteToMarketing = getMarketingRewrite(request);
  if (rewriteToMarketing) {
    addSecurityHeaders(rewriteToMarketing);
    return rewriteToMarketing;
  }

  const rewriteToPublicHomework = getPublicHomeworkRewrite(request);
  if (rewriteToPublicHomework) {
    addSecurityHeaders(rewriteToPublicHomework);
    return rewriteToPublicHomework;
  }

  const response = intlMiddleware(request);
  addSecurityHeaders(response);
  return response;
}

function getMarketingRewrite(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host");
  if (!host || !isMarketingHost(host)) return null;
  if (request.nextUrl.pathname.startsWith("/marketing")) return null;

  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const hasLocalePrefix = Boolean(firstSegment && locales.includes(firstSegment as (typeof locales)[number]));
  const locale = hasLocalePrefix ? firstSegment! : MARKETING_DEFAULT_LOCALE;
  const rest = (hasLocalePrefix ? segments.slice(1) : segments).join("/");

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/marketing/${locale}${rest ? `/${rest}` : ""}`;
  return NextResponse.rewrite(rewriteUrl);
}

function getPublicHomeworkRewrite(request: NextRequest): NextResponse | null {
  const hasSession =
    Boolean(request.cookies.get("authjs.session-token")?.value) ||
    Boolean(request.cookies.get("__Secure-authjs.session-token")?.value);
  if (hasSession) return null;

  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const hasLocalePrefix = Boolean(firstSegment && locales.includes(firstSegment as (typeof locales)[number]));
  const locale = hasLocalePrefix ? firstSegment! : defaultLocale;
  const pathSegments = hasLocalePrefix ? segments.slice(1) : segments;

  if (
    pathSegments.length === 6 &&
    pathSegments[0] === "courses" &&
    pathSegments[2] === "lessons" &&
    pathSegments[4] === "homework"
  ) {
    const courseSlug = pathSegments[1];
    const lessonSlug = pathSegments[3];
    const homeworkSlug = pathSegments[5];
    const localePathPrefix = `/${locale}`;

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `${localePathPrefix}/homework/open/${courseSlug}/${lessonSlug}/${homeworkSlug}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  if (
    pathSegments.length === 4 &&
    pathSegments[0] === "courses" &&
    pathSegments[2] === "lessons"
  ) {
    const courseSlug = pathSegments[1];
    const lessonSlug = pathSegments[3];
    const localePathPrefix = `/${locale}`;

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `${localePathPrefix}/lessons/open/${courseSlug}/${lessonSlug}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  return null;
}

function addSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
}

export const config = {
  // Второй паттерн обязателен: первый исключает пути с точкой,
  // а файлы в /uploads/homework содержат расширения
  matcher: ["/((?!_next|.*\\..*).*)", "/uploads/homework/:path*"],
};
