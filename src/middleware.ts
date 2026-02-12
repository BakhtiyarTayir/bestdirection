import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale, localePrefix } from "./i18n/config";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
});

export function middleware(request: NextRequest) {
  // Skip API routes
  if (request.nextUrl.pathname.startsWith("/api")) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  const response = intlMiddleware(request);
  addSecurityHeaders(response);
  return response;
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
