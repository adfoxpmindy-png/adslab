## Context

Today every public page in AdsLab is dynamic because `src/i18n/request.ts` (`getRequestConfig`) reads the `adslab-locale` cookie via `cookies()`. Once a Next.js page touches `cookies()` it is marked dynamic and Vercel can't edge-cache it. Public marketing/legal pages (`/`, `/login`, `/signup`, `/refund-policy`, `/terms`, `/privacy`, `/data-deletion`, `/verify-email`) are content-static — they only depend on the locale + translation dictionary — but they still pay a serverless invocation per request because of that one cookie read.

next-intl 4.x supports two locale models out of the box: cookie-based (what we have) and URL-prefix (what we want for ISR). The library's `createMiddleware` + `createNavigation` helpers handle the prefix model end-to-end including localized `<Link>` and `redirect`. The refactor is mechanical but wide: every page folder under `src/app/` moves under `src/app/[locale]/`, every internal `next/link` import switches to `@/i18n/routing`, and `i18n/request.ts` reads locale from route params instead of cookies.

The current architecture has ~80 page.tsx files and ~250 internal navigation call sites (Link, router.push, redirect). API routes don't need a prefix — they're not user-visible URLs.

Stakeholders: the founder (single-user product today), future paying agency clients (multi-user, multi-tenant), search engine crawlers (SEO benefit).

## Goals / Non-Goals

**Goals:**
- Public pages render statically per locale, served from Vercel edge cache, P50 TTFB <50 ms in Bangkok
- Internal Vercel function invocations on public pages drop to near zero (cache hit rate >95%)
- SEO improves: `hreflang` alternates point to distinct URLs (`/th/...`, `/en/...`, `/lo/...`)
- Existing bookmarks, shared links, and old email CTAs continue to work via legacy-URL redirect middleware
- Smoke tests and CI continue to enforce the i18n safety net (typed messages, missing-key audit, MISSING_MESSAGE smoke)
- The change ships behind a single deploy — no flag, no toggle, no "two systems live in parallel"

**Non-Goals:**
- Server-side caching of authenticated tenant pages (`/[locale]/t/<slug>/**`) — they read session + tenant data per request, stay dynamic
- Changing the locale set (still `th`, `en`, `lo`)
- Changing the translation dictionaries (no `messages/*.json` changes beyond what landing-page route changes might imply)
- Customer-facing URL slugs (e.g. tenant slug, campaign id) — only the locale prefix changes
- Removing the legacy redirect — keep at least 90 days; future change can drop it

## Decisions

### D1. Use `next-intl`'s `createMiddleware` with `localePrefix: "always"`

next-intl provides `createMiddleware({ locales, defaultLocale, localePrefix })` in 4.x. We choose `"always"` (every URL has a locale prefix) over `"as-needed"` (default locale has no prefix) because:
- `"always"` is symmetric — `/th/login`, `/en/login`, `/lo/login` all valid; no special-cased "default" rendering branch
- Cleaner SEO (every locale has its own URL — no implicit canonical preference)
- Simpler mental model for engineers: every page URL starts with a locale segment
- Cost of "always": Thai users (default) see an extra `/th/` in their URL bar — acceptable trade for the architecture clarity

Alternative considered: `"as-needed"` would keep Thai URLs prefix-free (`/login` stays `/login` for Thai). Rejected because the dual-branch rendering (default vs prefixed) doubles the testing surface and complicates link helpers.

### D2. Cookie stays — as fallback only

Even with URL-prefix routing, we keep writing `adslab-locale` cookie when the user picks a language. The cookie's role becomes:
- Initial landing decision: middleware uses cookie to pick which `/<locale>/` to redirect to for legacy-URL traffic
- Cross-device continuity: a logged-in user's `User.preferredLocale` is the canonical source for emails / cron output; the cookie mirrors it for browser navigation

Alternative considered: cookie-free. Rejected because legacy bookmarks (`/login`) need SOME signal to choose the locale for the 307 redirect, and Accept-Language alone is unreliable in Asia (many users have English browsers but want Thai content).

### D3. `next-intl`'s `createNavigation` for all internal navigation

`@/i18n/routing` exports localized `<Link>`, `redirect`, `useRouter`, `usePathname`. All internal navigation switches to these. They auto-prefix the active locale.

The migration is mechanical: replace `from "next/link"` → `from "@/i18n/routing"`, replace `import { redirect } from "next/navigation"` → `from "@/i18n/routing"`. Codemod-friendly.

Exception: `next/link`'s `<Link>` is preserved for EXTERNAL URLs (outside our app) and for the locale-switcher itself (which intentionally crosses locale boundaries).

### D4. Public pages opt into ISR via `generateStaticParams` + `revalidate`

For each public page, add:
```ts
export const revalidate = 3600;
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
```

This tells Next.js to pre-build 3 static variants at deploy time and refresh from the source every hour. Output is served from edge cache, no serverless function invocation.

Authenticated tenant pages stay dynamic (no `generateStaticParams`) — they read `requireTenantMember()` which calls `cookies()`.

Alternative considered: `force-static` with the locale baked into a per-page constant. Rejected because we'd lose the ability to switch locale; URL-based locale is the whole point.

### D5. API routes stay unprefixed at `/api/*`

API routes don't need a locale prefix because:
- They return JSON, not HTML — no `<html lang="">` to set
- Locale arrives via `resolveUserLocale(session.userId)` from the DB column for authenticated callers, or `resolveActiveLocale()` (which reads cookie/Accept-Language) for public callers
- Adding `/[locale]/api/*` would invalidate every existing external integration (webhooks, OAuth callbacks)

The middleware `matcher` config explicitly excludes `/api/**`.

### D6. Language switcher uses next-intl's `Link` with the target locale

To switch from Thai to English while on `/th/t/agency/dashboard`, the switcher renders `<Link href="/t/agency/dashboard" locale="en">` — next-intl's `Link` with an explicit `locale` prop rewrites the URL to `/en/t/agency/dashboard`. This is cleaner than the current hand-rolled `router.push(currentPath.replace(...))`.

Server-side, the switcher's POST handler also updates `User.preferredLocale` + sets the cookie, then 307-redirects to the new URL.

### D7. Email templates accept `locale` and emit absolute URLs with prefix

The existing email templates (verify-email, billing reminders, daily-report HTML) already accept `locale: Locale` per the earlier i18n migration. They just need to update URL construction:
```ts
// Before
const link = `${APP_URL}/t/${tenantSlug}/settings/billing`;
// After
const link = `${APP_URL}/${locale}/t/${tenantSlug}/settings/billing`;
```

This is ~8 call sites across `src/lib/email/templates/*.ts`.

## Risks / Trade-offs

[Risk: missing a `<Link>` migration somewhere → user clicks → 404 or wrong locale] → Mitigation: jscodeshift / ts-morph codemod replaces all `next/link` imports under `src/` with `@/i18n/routing` (the new module re-exports `Link` so the import path swap is the only change for non-locale-aware callers). Then Playwright smoke covers ~24 critical click-paths in 3 locales.

[Risk: legacy email links break] → Mitigation: middleware adds 307 redirect for non-prefixed legacy URLs for at least 90 days. Plus an opt-in alternative: the email-template URL builder can lookup recipient's preferredLocale from DB and emit prefixed URLs even for OLD emails about to be sent.

[Risk: Sentry release sourcemaps stale — minified stack traces after deploy] → Mitigation: the `SENTRY_AUTH_TOKEN` we provisioned earlier auto-uploads new sourcemaps on the next Vercel build. First deploy after this change ships will re-map all paths.

[Risk: SEO transition — search engines see new URLs but still rank old ones] → Mitigation: 307 redirect is correctly NOT 301 (we want to preserve old URLs during the 90-day transition); after 90 days, switch to 301 for the cutover. `sitemap.xml` generates one entry per locale-prefixed URL.

[Trade-off: Thai users (90% of current traffic) see `/th/` in their URL bar] → Accepted. The architectural clarity from `localePrefix: "always"` is worth the cosmetic noise.

[Trade-off: ~250 navigation call sites touched in one PR is huge] → Phase the work: P1 = middleware + routing config + redirect (smallest viable shipping unit, no Link migration yet, redirect handles all existing links transparently). P2 = codemod Link migrations + smoke verification. P3 = email URL builders + cleanup.

[Risk: tenant pages under `/[locale]/t/...` need session reads, which is dynamic — does the locale prefix conflict with the dynamic data fetch?] → No conflict. Next.js handles mixed routes: `[locale]` can be static-params, `[tenantSlug]` is still dynamic. The page itself reads session + data per request as before. The only locale-affected change is the URL path.

## Migration Plan

**Phase 1 — Scaffold + redirect (3-4 hours, smallest shipping unit)**
1. Add `src/i18n/routing.ts` declaring locales, defaultLocale, localePrefix.
2. Create `src/middleware.ts` using next-intl's `createMiddleware` + the legacy-URL redirect logic.
3. Move every folder under `src/app/` (except `api/` and root-level files like `layout.tsx`, `global-error.tsx`, `instrumentation*.ts`) under `src/app/[locale]/`.
4. Update `src/app/[locale]/layout.tsx` to accept `params: Promise<{ locale: string }>`, validate against `LOCALES`, pass to `NextIntlClientProvider`.
5. Update `src/i18n/request.ts` to read locale from `routing.locales` + params instead of cookies.
6. Update root `src/app/layout.tsx` — minimal shell or remove (the [locale]/layout.tsx becomes the real layout).
7. Update Sentry config paths if needed.
8. Deploy. At this point: all old URLs 307-redirect to `/<locale>/...`. ISR not enabled yet on individual pages.

**Phase 2 — Internal Link migration + ISR enablement (4-6 hours)**
9. Run codemod across `src/**/*.{ts,tsx}` replacing `import { Link } from "next/link"` → `import { Link } from "@/i18n/routing"`, same for `redirect`, `useRouter`, `usePathname`.
10. Update language switcher to use next-intl `<Link>` with explicit `locale` prop.
11. Add `export const revalidate = 3600` + `generateStaticParams` to public page files.
12. Update Playwright smoke tests to expect `/<locale>/<path>` URLs.
13. `npm run verify` + `npm run test:smoke` clean.
14. Deploy.

**Phase 3 — Email + absolute URLs + cleanup (1-2 hours)**
15. Update email-template URL builders to include locale prefix.
16. Update OAuth callback URLs if any build absolute paths.
17. Generate fresh `sitemap.xml` covering all locales.
18. Verify in production: open Vercel deploy → Functions tab → confirm public pages register as "Static" not "Dynamic".

**Rollback plan**
If Phase 1 breaks production:
1. `git revert` the merge commit on `main` → push → Vercel auto-redeploys previous build → all URLs back to root-level routing.
2. If only middleware misbehaves, push a tiny revert that removes `src/middleware.ts` only — the moved `[locale]` folders gracefully degrade because next-intl's request config falls back to the default locale.

Phases 2 and 3 are individually revertable.

## Open Questions

- Should the locale switcher persist preference to DB on every switch, or only when the user is logged in? (Current code: only when logged in. Probably keep that.)
- Should we add `301` redirects after the 90-day grace period, or keep `307` indefinitely? Search-engine SEO would prefer 301 eventually, but 301s cache aggressively and are hard to undo if we ever revert.
- Do we want a `/` route at the absolute root that 307-redirects to the user's preferred locale, OR do we statically render a locale-picker landing page? Current proposal: 307 redirect via middleware. Alternative: static `/` page with 3 language buttons (avoids the redirect hop). Decide before P1 ships.
