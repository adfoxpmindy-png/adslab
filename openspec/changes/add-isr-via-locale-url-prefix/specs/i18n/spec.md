## MODIFIED Requirements

### Requirement: Cookie-based locale detection
The system SHALL detect the active locale primarily from the URL's first path segment (`/th/...`, `/en/...`, `/lo/...`). The `adslab-locale` cookie remains as a SECONDARY fallback used by the middleware to choose a locale when the user arrives at a legacy URL without a locale prefix — the middleware then redirects to the prefixed URL.

The middleware order is:
1. URL path segment matches `^/(th|en|lo)/`, use that locale.
2. Else, read `adslab-locale` cookie. If valid → redirect to `/<cookie-locale>/<original-path>`.
3. Else, parse `Accept-Language` header. If first language tag is in `LOCALES` → redirect to `/<that>/<original-path>`.
4. Else → redirect to `/th/<original-path>`.

API routes (`/api/**`) are exempt from locale prefixing and the redirect chain.

#### Scenario: First-time visitor with Lao browser
- **WHEN** an unauthenticated user visits `/` with `Accept-Language: lo,en;q=0.9` and no cookie
- **THEN** the middleware 307-redirects to `/lo/` and sets `adslab-locale=lo` cookie

#### Scenario: Returning visitor with cookie
- **WHEN** a user with `adslab-locale=en` cookie visits `/login`
- **THEN** the middleware 307-redirects to `/en/login`

#### Scenario: Direct URL with locale prefix
- **WHEN** a user visits `/th/refund-policy` (no cookie present)
- **THEN** the page renders Thai content, no redirect, and the middleware sets `adslab-locale=th` cookie for future visits

#### Scenario: API route bypass
- **WHEN** any client calls `/api/auth/login` or any other `/api/*` route
- **THEN** the middleware does NOT inject a locale prefix; the route handler resolves the user's locale via `resolveUserLocale(userId)` against the DB column

### Requirement: Per-user locale preference
The system SHALL persist each user's chosen locale on `User.preferredLocale` (default `"th"`). Changing locale via the language switcher MUST:
1. Update `User.preferredLocale` in the DB.
2. Rewrite the `adslab-locale` cookie.
3. Navigate the user to the equivalent URL with the new locale prefix (e.g., from `/th/dashboard` to `/en/dashboard`), preserving the path and query.

#### Scenario: Change locale via switcher
- **WHEN** a user on `/th/t/agency-x/dashboard` clicks "English" in the language switcher
- **THEN** `User.preferredLocale` becomes `"en"`, the cookie rewrites to `en`, and the page navigates to `/en/t/agency-x/dashboard` without losing scroll position or in-progress form state in the URL

### Requirement: Date / number formatting honors locale
The system SHALL provide `formatDateTime(date, locale)` and `formatCurrency(amount, locale, currency)` helpers in `src/lib/i18n/format.ts`. Component code MUST use these helpers instead of hardcoding `toLocaleString("th-TH", ...)` calls.

The helpers wrap `Intl.DateTimeFormat` / `Intl.NumberFormat` with the active locale and consistent options (numeric day + short month + 24-hour time for dates; THB symbol with no fractional digits for currency).

The `locale` value comes from `getLocale()` server-side (which reads `params.locale` from the URL segment in the new routing) or `useLocale()` client-side.

#### Scenario: Date format consistency across locales
- **WHEN** a campaign was created on 2026-05-17 and is displayed in three different user locales
- **THEN** `/th` shows "17 พ.ค. 2026", `/en` shows "17 May 2026", `/lo` shows "17 ພ.ຄ. 2026"

## ADDED Requirements

### Requirement: Public pages cache at the edge per locale
Public pages without authentication state SHALL be statically generated per locale and revalidated periodically rather than rendered fresh per request. Affected pages: `/`, `/login`, `/signup`, `/refund-policy`, `/terms`, `/privacy`, `/data-deletion`, `/verify-email`.

Each affected page MUST:
1. Export `generateStaticParams` returning all 3 locales (`th`, `en`, `lo`).
2. Export `revalidate = 3600` (1 hour) — long enough to win the cache, short enough that translation updates appear within an hour.
3. NOT call `cookies()`, `headers()`, or any other dynamic API at render time (the locale arrives via `params.locale` from the URL segment, not a cookie).

Authenticated tenant pages under `/[locale]/t/<tenant>/**` remain dynamic — they read session cookies and tenant data per request.

#### Scenario: Landing page served from edge cache
- **WHEN** a user visits `/th` from Bangkok
- **THEN** the response is served from the Vercel edge in <100ms with no serverless function invocation (visible in Vercel logs as `static`), and the HTML's `<html lang="th">` matches the URL segment

#### Scenario: Cached page refreshes within revalidate window
- **WHEN** a translation in `messages/th.json` is updated and deployed at T+0
- **THEN** users hitting `/th/refund-policy` see the new content within 60 minutes (the next revalidate tick), without needing a manual cache invalidation

### Requirement: Localized navigation primitives
All internal navigation in client and server code SHALL use next-intl's localized `<Link>` and `redirect` / `useRouter` from `@/i18n/routing` instead of the raw `next/link` and `next/navigation` primitives. The localized variants automatically prefix the current locale.

Exception: API routes that build absolute URLs (email templates, OAuth callbacks) MUST pass `locale` explicitly when constructing the path.

#### Scenario: Internal navigation preserves locale
- **WHEN** a user on `/en/login` clicks a `<Link href="/signup">` rendered by the page
- **THEN** the resulting URL is `/en/signup` (not `/signup` or `/th/signup`)

#### Scenario: Email confirmation link carries recipient locale
- **WHEN** the system sends a billing-reminder email to a user with `preferredLocale = "lo"`
- **THEN** the email body's primary CTA points to `https://ads-lab.xyz/lo/t/<slug>/settings/billing`, not `/th/...` or `/t/...`

### Requirement: Legacy URL redirect during transition
The middleware SHALL serve a 307 redirect from any non-prefixed legacy URL to the locale-prefixed equivalent for at least 90 days after this change ships. Affected legacy URLs include external links saved by users (bookmarks, shared links, indexed search results, old email CTAs).

After 90 days the redirect MAY be removed; until then it is a hard requirement.

#### Scenario: Legacy bookmark still works
- **WHEN** a user with `adslab-locale=th` cookie clicks a bookmark to `/login` (no locale prefix)
- **THEN** the response is a 307 redirect to `/th/login` and the user lands on the localized page without seeing a 404

#### Scenario: Old email CTA still works
- **WHEN** a user clicks a link from a billing email sent before the change shipped, pointing to `https://ads-lab.xyz/t/<slug>/settings/billing`
- **THEN** the middleware 307-redirects to `/<recipient-locale>/t/<slug>/settings/billing` (locale chosen from cookie, falling back to Accept-Language, falling back to `th`)
