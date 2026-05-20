## Why

Public pages (`/`, `/login`, `/signup`, `/refund-policy`, `/terms`, `/privacy`, `/data-deletion`) are dynamic-per-request because `resolveActiveLocale()` reads the `adslab-locale` cookie at render time. Vercel can't edge-cache them. Each visit costs a serverless function invocation (~150ms TTFB + Vercel function cost). With the locale moved into the URL (`/th/login`, `/en/login`, `/lo/login`) the same pages become statically generated per locale → edge-cached at <50ms TTFB and ~zero function cost. SEO improves too: search engines index distinct URLs per locale and serve the right one. The trade is a one-time refactor of all internal links/redirects to be locale-aware.

## What Changes

- **BREAKING**: All app routes move from `src/app/<path>` to `src/app/[locale]/<path>`. The dynamic `[locale]` segment is the first path segment of every page URL.
- New file `src/middleware.ts` (or update if present) using `next-intl/middleware` to (a) enforce locale prefix, (b) auto-redirect legacy URLs without a locale prefix (`/login` → `/th/login` based on cookie/Accept-Language fallback), (c) preserve current locale on internal navigation.
- New `src/i18n/routing.ts` declaring the next-intl routing config (locales, default, prefix mode).
- `src/i18n/request.ts` switches from cookie-based locale resolution to URL-based (reads `params.locale` instead of `cookies().get("adslab-locale")`).
- All internal `<Link>` and `redirect()` / `router.push()` calls migrate to next-intl's localized `<Link>` and `redirect`/`useRouter` from `@/i18n/routing` so paths auto-prefix the active locale.
- Email templates (verify-email, billing reminders) that build absolute URLs now include the recipient's locale in the path.
- API routes stay at `/api/*` (no `[locale]` prefix) — they're locale-agnostic; locale arrives via the existing `resolveUserLocale(userId)` from the DB column.
- Public pages opt into static generation via `generateStaticParams` for the 3 locales + `export const revalidate = 3600`.
- Sentry release config rebuilds because sourcemap paths change.
- Playwright smoke tests update to expect `/<locale>/<path>` URLs.

## Capabilities

### New Capabilities

(none — this is a refactor of an existing capability, not a new one)

### Modified Capabilities

- `i18n`: locale source changes from cookie-only to URL-first-with-cookie-fallback; public pages gain ISR-per-locale; localized `<Link>` / `redirect` become the required navigation primitives; the language switcher rewrites the URL instead of (or in addition to) setting a cookie.

## Impact

- **Code**: every `src/app/*` route folder moves under `src/app/[locale]/` (~80 page.tsx / layout.tsx files). Every `<Link>` and `router.push` / `redirect` call (~250 call sites estimated) migrates to next-intl primitives. Test files update path expectations.
- **APIs**: API routes unchanged (locale-agnostic). Email-template URL builders gain a `locale` parameter so they emit `/<locale>/<path>` absolute URLs.
- **Bookmarks / external links**: Phase 1 middleware redirects legacy URLs so existing bookmarks keep working. Phase 2 (later) can drop the redirect.
- **SEO**: `<link rel="alternate" hreflang="th">` etc. become accurate per page. Sitemap rebuilds with one entry per locale per page.
- **Sentry**: source map paths change → next Sentry release needs to re-upload sourcemaps. The auto-token we have already configured handles this on the next deploy.
- **Vercel cost**: drops on public-page traffic because edge cache serves them. Authenticated tenant pages still dynamic (no change there).
- **Risk**: ~250 link/redirect sites is high churn — most likely failure mode is missing a Link migration somewhere → user clicks → 404 or wrong-locale render. Mitigated by a codemod in Phase 2 + Playwright smoke covering all critical paths.
