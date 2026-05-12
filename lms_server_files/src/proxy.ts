import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale, localePrefix } from "./i18n/config";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
});

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api")) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
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
  matcher: ["/((?!_next|.*\\..*).*)"],
};
