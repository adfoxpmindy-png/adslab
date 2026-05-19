## 1. Phase 1 — Scaffold + redirect (deployable on its own)

- [ ] 1.1 Create `src/i18n/routing.ts` exporting `routing` (locales, defaultLocale=`"th"`, localePrefix=`"always"`) and `createNavigation(routing)` re-exports (`Link`, `redirect`, `useRouter`, `usePathname`, `getPathname`)
- [ ] 1.2 Add `next-intl/middleware` to package.json verified-version and create `src/middleware.ts` that calls `createMiddleware(routing)` + handles legacy non-prefixed URLs (307 redirect using cookie → Accept-Language → `th` fallback). Excludes `/api/**`, `/_next/**`, static assets via `config.matcher`
- [ ] 1.3 Decide root `/` behavior — pick between (a) middleware 307-redirects to `/<locale>/`, OR (b) static locale-picker landing page. Document in design.md "Open Questions"
- [ ] 1.4 Create `src/app/[locale]/layout.tsx` accepting `params: Promise<{ locale: string }>`, validates via `isLocale()`, wraps children in `NextIntlClientProvider locale={locale} messages={messages}`. Existing root `src/app/layout.tsx` shrinks to a minimal shell or is deleted
- [ ] 1.5 Move every folder under `src/app/` (except `api/`, plus root files `global-error.tsx`, `favicon.ico`, `globals.css`, `instrumentation*.ts`) under `src/app/[locale]/`. Use `git mv` to preserve history
- [ ] 1.6 Update `src/i18n/request.ts` `getRequestConfig` to read `locale` from `await routing.requestLocale` instead of `cookies().get(COOKIE_NAME)`. Cookie code becomes the middleware-only fallback path
- [ ] 1.7 Verify type-safety: `npx tsc --noEmit` clean — the `[locale]` segment introduces typed-route param `params.locale: Locale`
- [ ] 1.8 Run Playwright smoke locally — tests currently expect `/login` etc., so most will fail. Update `tests/e2e/i18n-smoke.spec.ts` PUBLIC_ROUTES from `/login` → `/${locale}/login` (parametrize with locale)
- [ ] 1.9 Smoke 24/24 pass against new URL structure
- [ ] 1.10 Push to a Vercel preview deploy. Manual eyeball test 3 critical paths (landing, login, tenant dashboard) in 3 locales. Confirm legacy `/login` redirects to `/th/login` (with cookie set)
- [ ] 1.11 Merge to main, push, Vercel deploys production. Confirm via curl that public pages return `x-vercel-cache: STATIC` or `HIT` after first visit (vs `MISS` for dynamic). End of Phase 1

## 2. Phase 2 — Localized navigation + ISR enablement

- [ ] 2.1 Codemod (or manual sweep with grep+sed) replaces `import .* from "next/link"` → `import .* from "@/i18n/routing"` across `src/**/*.{ts,tsx}` EXCEPT `next/link` is preserved for explicit external links (none expected currently, but verify)
- [ ] 2.2 Same codemod replaces `import { redirect, useRouter, usePathname } from "next/navigation"` → `from "@/i18n/routing"` (function call sites stay identical)
- [ ] 2.3 Update the language switcher (`src/components/tenant/language-switcher.tsx`) to use next-intl `<Link href={pathname} locale={loc}>` — this rewrites the URL and the middleware handles cookie + DB persistence on next request
- [ ] 2.4 Add ISR config to public pages (one edit per file):
  - `src/app/[locale]/page.tsx` (landing) — `export const revalidate = 3600; export function generateStaticParams() { return LOCALES.map(locale => ({ locale })); }`
  - `src/app/[locale]/login/page.tsx`
  - `src/app/[locale]/signup/page.tsx`
  - `src/app/[locale]/refund-policy/page.tsx`
  - `src/app/[locale]/terms/page.tsx`
  - `src/app/[locale]/privacy/page.tsx`
  - `src/app/[locale]/data-deletion/page.tsx`
  - `src/app/[locale]/verify-email/page.tsx` — careful, has dynamic `?token=` query but page itself can still be ISR
- [ ] 2.5 Confirm authenticated tenant pages (`/[locale]/t/[tenantSlug]/...`) do NOT add `generateStaticParams` — they remain dynamic. Spot-check no accidental opt-in
- [ ] 2.6 Update `tests/e2e/screenshots.spec.ts` ROUTES + LOCALE_HOOKS to use new URL pattern
- [ ] 2.7 `npm run verify` + `npm run test:smoke` both clean
- [ ] 2.8 Vercel preview deploy. Verify via Vercel dashboard → Functions tab that public pages register as "Static" / "Edge cached" not "Dynamic"
- [ ] 2.9 Lighthouse run on `/th` (or `/en`) — target P50 TTFB <50ms after second visit, +20pts performance score vs pre-change baseline
- [ ] 2.10 Merge + deploy production. End of Phase 2

## 3. Phase 3 — Email + absolute URLs + cleanup

- [ ] 3.1 Audit `src/lib/email/templates/*.ts` for absolute URLs. Update `verify-email.ts`, `billing.ts`, `daily-report.ts` URL builders to inject locale prefix from the `locale` param they already receive
- [ ] 3.2 Audit `src/app/api/meta/*/oauth/callback/route.ts` and any other route that builds an absolute redirect URL — update to include locale prefix (locale comes from session.userId → resolveUserLocale)
- [ ] 3.3 Generate / update `src/app/sitemap.ts` to emit one URL per (page × locale) combination
- [ ] 3.4 Generate / update `src/app/robots.ts` if it references specific paths
- [ ] 3.5 Test email rendering by triggering `verifyEmailTemplate("test", "https://ads-lab.xyz", "th")` and confirming the CTA href is `/th/verify-email?token=...`
- [ ] 3.6 Spot-check Sentry — confirm next deploy's sourcemap upload mapped to new `[locale]/...` file paths
- [ ] 3.7 Update `CLAUDE.md` and `openspec/specs/i18n/spec.md` if any conventions changed (most should already match the spec deltas in this change)
- [ ] 3.8 Archive this change via `openspec archive add-isr-via-locale-url-prefix`. End of Phase 3

## 4. Verification (cross-phase)

- [ ] 4.1 After Phase 1: confirm `curl -I https://ads-lab.xyz/login` returns `307` with `location: /th/login` (or whichever locale cookie says)
- [ ] 4.2 After Phase 2: confirm `curl -I https://ads-lab.xyz/th` returns `200` with `x-vercel-cache: HIT` (after first visit warms the cache) and `cache-control` indicating revalidate window
- [ ] 4.3 After Phase 3: send a real test verification email; confirm the email CTA href contains `/<locale>/`
- [ ] 4.4 Run audit-missing-keys-v3.py + audit-emojis.py — both clean (no regression)
- [ ] 4.5 Production Sentry shows no spike in errors after each phase ships
- [ ] 4.6 Lighthouse score improvement noted in commit message of the final phase
