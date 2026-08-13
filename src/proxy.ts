/**
 * Next.js 16 proxy (formerly `middleware`). Three responsibilities:
 *
 *   1. Locale URL-prefix enforcement via next-intl's createMiddleware.
 *      URLs not starting with /<locale>/ get 307-redirected to their
 *      prefixed equivalent. The locale chosen comes from (in order):
 *      adslab-locale cookie → Accept-Language → DEFAULT_LOCALE ("th").
 *
 *   2. Legacy tenant route → Lab route 307 redirects. The flat tenant
 *      URLs (/dashboard, /boost, ...) were consolidated into 5 Labs
 *      in add-lab-information-architecture. Old URLs continue to work
 *      via 307 so bookmarks and email CTAs survive.
 *
 *   3. Cookie-existence check (only) on tenant routes `/<locale>/t/...`.
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

/**
 * Map of legacy tenant sub-paths → Lab sub-paths. Keys and values are the
 * path AFTER `/t/<tenantSlug>` so we can rewrite both static URLs and
 * dynamic-segment URLs (e.g. `/reports/r_123` → `/insights/reports/r_123`).
 *
 * Order matters: longer keys must come first so `/campaigns/new` matches
 * before `/campaigns` (and `/ai/memory` before `/ai`). Sorted once at
 * module load by key length descending.
 */
const LAB_REDIRECTS: ReadonlyArray<readonly [string, string]> = (
  [
    ["/dashboard", "/insights"],
    ["/reports", "/insights/reports"],
    ["/journey", "/insights/journey"],
    ["/competitors", "/insights/competitors"],
    ["/boost", "/launch/boost"],
    ["/campaigns/new", "/launch/new"],
    ["/campaigns/ai-new", "/launch/ai-new"],
    ["/campaigns/history", "/launch/history"],
    ["/campaigns", "/launch/campaigns"],
    ["/ads", "/launch"],
    ["/audiences", "/launch/audiences"],
    ["/creatives", "/launch/creatives"],
    ["/posts/new", "/launch/posts/new"],
    ["/posts", "/launch/posts"],
    ["/ai/memory", "/ai-lab/memory"],
    ["/ai-optimize", "/ai-lab/recommendations"],
    ["/ai", "/ai-lab"],
    ["/rules", "/automation"],
    ["/goals/naming", "/automation/naming"],
    ["/goals", "/automation/goals"],
    ["/events", "/automation/events"],
    ["/tools", "/insights"],
  ] as const
)
  .slice()
  .sort(([a], [b]) => b.length - a.length);

/** Tenant inner path (e.g. `/dashboard`, `/campaigns/r_abc`) → Lab inner
 * path, or null if the input doesn't match any legacy key.
 *
 * Hook Lab lives at `/creatives/hooks` (standalone sidebar section) and
 * must NOT get caught by the legacy `/creatives → /launch/creatives`
 * redirect. Match it first and return null so the request continues to
 * the real page.
 */
function resolveLabRedirect(innerTenantPath: string): string | null {
  if (
    innerTenantPath === "/creatives/hooks" ||
    innerTenantPath.startsWith("/creatives/hooks/")
  ) {
    return null;
  }
  for (const [from, to] of LAB_REDIRECTS) {
    if (innerTenantPath === from || innerTenantPath.startsWith(`${from}/`)) {
      return to + innerTenantPath.slice(from.length);
    }
  }
  return null;
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

    // 2b. Legacy tenant routes → 307 to their Lab equivalent.
    //
    // innerPath = `/t/<slug>/<rest>` so split returns:
    //   ["", "t", "<slug>", ...rest]
    //    [0] [1]   [2]      [3+]
    // tenantSlug is at index 2, NOT 3 — earlier code had this wrong and
    // silently killed every single-segment redirect (`/t/<slug>/tools`,
    // `/t/<slug>/dashboard`, etc.).
    const tenantParts = innerPath.split("/");
    const tenantSlug = tenantParts[2];
    if (tenantSlug) {
      const innerTenantPath = "/" + tenantParts.slice(3).join("/");
      const labTarget = resolveLabRedirect(innerTenantPath);
      if (labTarget) {
        const labUrl = request.nextUrl.clone();
        labUrl.pathname = `/${firstSegment}/t/${tenantSlug}${labTarget}`;
        return NextResponse.redirect(labUrl, 307);
      }
    }
  }

  // 3. Let next-intl handle cookie sync, alternate-link headers, etc.
  return intlMiddleware(request);
}

export const config = {
  // Match every page navigation except API, static assets, Next internals,
  // `/v/<token>` viewer-mode share links, and `/pitch/*` public sales pages
  // (both handled outside the locale prefix flow — those pages own their
  // own layout and don't need a /<locale>/ URL prefix).
  matcher: [
    "/((?!api|v/|pitch/|_next|monitoring|favicon\\.ico|adslab-logo\\.png|sdk\\.js|robots\\.txt|sitemap\\.xml).*)",
  ],
};
