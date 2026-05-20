/**
 * Next.js 16 proxy (formerly `middleware`). Two responsibilities:
 *
 *   1. Locale URL-prefix enforcement via next-intl's createMiddleware.
 *      URLs not starting with /<locale>/ get 307-redirected to their
 *      prefixed equivalent. The locale chosen comes from (in order):
 *      adslab-locale cookie → Accept-Language → DEFAULT_LOCALE ("th").
 *
 *   2. Cookie-existence check (only) on tenant routes `/<locale>/t/...`.
 *      The actual session verification happens in `requireTenantMember`
 *      on the server-component layer. The proxy just bounces obviously
 *      logged-out users to /login before they load the heavy tenant page.
 *
 * API routes (`/api/**`), Next.js internals, and static assets are excluded
 * via the matcher so this proxy runs only on real page navigations.
 */
import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";
import { LOCALES, isLocale, resolveLocaleFromString, type Locale } from "@/i18n/locales";

const SESSION_COOKIE_NAME = "adslab_session";

const intlMiddleware = createIntlMiddleware(routing);

function resolveLocaleForRedirect(request: NextRequest): Locale {
  const cookieValue = request.cookies.get("adslab-locale")?.value;
  if (isLocale(cookieValue)) return cookieValue;
  const acceptLang = request.headers.get("accept-language");
  return resolveLocaleFromString(acceptLang ?? null);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];
  const hasLocalePrefix = firstSegment ? LOCALES.includes(firstSegment as Locale) : false;

  // 1. URL has no locale prefix → 307 to /<locale>/<original-path>.
  if (!hasLocalePrefix) {
    const locale = resolveLocaleForRedirect(request);
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
    return NextResponse.redirect(url, 307);
  }

  // 2. Tenant routes need a session cookie before they're served. Strip the
  // locale segment to test the inner path.
  const innerPath = "/" + pathname.split("/").slice(2).join("/");
  if (innerPath.startsWith("/t/")) {
    const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
    if (!hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = `/${firstSegment}/login`;
      loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(loginUrl);
    }
  }

  // 3. Let next-intl handle cookie sync, alternate-link headers, etc.
  return intlMiddleware(request);
}

export const config = {
  // Match every page navigation except API, static assets, and Next internals.
  matcher: [
    "/((?!api|_next|monitoring|favicon\\.ico|adslab-logo\\.png|sdk\\.js|robots\\.txt|sitemap\\.xml).*)",
  ],
};
