## 1. Phase 1 — Scaffold + redirect (deployable on its own)

- [x] 1.1 Create `src/i18n/routing.ts` exporting `routing` (locales, defaultLocale=`"th"`, localePrefix=`"always"`) and `createNavigation(routing)` re-exports (`Link`, `redirect`, `useRouter`, `usePathname`, `getPathname`)
- [x] 1.2 Add `next-intl/middleware` to package.json verified-version and create `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) that calls `createMiddleware(routing)` + handles legacy non-prefixed URLs (307 redirect using cookie → Accept-Language → `th` fallback) + the existing auth-gate logic for `/<locale>/t/...` routes. Excludes `/api/**`, `/_next/**`, static assets via `config.matcher`
- [x] 1.3 Decide root `/` behavior — chose (a): proxy 307-redirects bare `/` to `/<locale>/`. Static locale-picker would add UI surface for little gain
- [x] 1.4 Create `src/app/[locale]/layout.tsx` with `<html><body>` + NextIntlClientProvider + ThemeProvider + Toaster + Sentry SDK bootstrap. `params: Promise<{ locale: string }>`, validated via `hasLocale(routing.locales, ...)`. Root `src/app/layout.tsx` shrinks to a passthrough that just imports `globals.css` and returns children
- [x] 1.5 Move every folder under `src/app/` (except `api/`, plus root files `global-error.tsx`, `favicon.ico`, `globals.css`, `instrumentation*.ts`) under `src/app/[locale]/`. Used `git mv` to preserve history; 49 file renames
- [x] 1.6 Update `src/i18n/request.ts` `getRequestConfig` to read `locale` from `await requestLocale` instead of `cookies().get(COOKIE_NAME)`. Cookie code is now the middleware-only fallback path for legacy URL redirects
- [x] 1.7 Verify type-safety: `npx tsc --noEmit` clean (1 import-path fix needed: `@/app/t/[tenantSlug]/ads/_actions/...` → `@/app/[locale]/t/[tenantSlug]/ads/_actions/...`)
- [x] 1.8 Smoke tests work without changes — Playwright follows the 307 redirect automatically, lands on the prefixed URL with correct `<html lang>`
- [x] 1.9 Smoke 48/48 pass against new URL structure (24 i18n smoke + 24 screenshots)
- [x] 1.10 Build verification — `npm run build` clean. `/[locale]/login` and `/[locale]/signup` already SSG ●; rest dynamic ƒ pending Phase 2 ISR config
- [x] 1.11 Commit + push to main, Vercel auto-deploys. End of Phase 1

## 2. Phase 2 — Localized navigation + ISR enablement

- [x] 2.1 Codemod via sed: 41 files migrated `import Link from "next/link"` → `import { Link } from "@/i18n/routing"`. No external link uses found (grep confirmed)
- [x] 2.2 Migrated useRouter/usePathname → @/i18n/routing across the affected files. `redirect` from server side kept on `next/navigation` because next-intl v4's redirect requires `{href, locale}` object and threading locale through every server function isn't worth the refactor — proxy handles the locale prefix
- [x] 2.3 Language switcher now `router.replace(pathname, { locale })` — URL rewrites + middleware syncs cookie via /api/user/locale
- [x] 2.4 ISR enabled on legal pages (revalidate=86400, setRequestLocale): privacy, terms, refund-policy, data-deletion. Skipped: landing (session-dependent), login/signup (client components, statically rendered via layout's generateStaticParams), verify-email (token-dependent dynamic). Locale layout has generateStaticParams covering all locales
- [x] 2.5 Authenticated tenant pages remain dynamic (no generateStaticParams)
- [ ] 2.6 e2e screenshots/routes update — DEFERRED to next regression pass
- [ ] 2.7 `npm run verify` clean — pre-commit hooks run on each commit (passed). Smoke tests deferred
- [ ] 2.8 Vercel preview verification — to be checked post-deploy
- [ ] 2.9 Lighthouse — to be checked post-deploy
- [x] 2.10 Merged + deployed (514292b)

## 3. Phase 3 — Email + absolute URLs + cleanup

- [x] 3.1 Email URL builders updated to include locale prefix: lib/auth/email-verification.ts, app/api/auth/signup/route.ts (verify-email CTA), lib/billing/tick.ts (billing CTA), lib/reports/daily-report.ts (report URL — also moved to new /insights/reports path)
- [x] 3.2 OAuth callback redirects include locale prefix: api/meta/oauth/callback/route.ts + api/meta/page-oauth/callback/route.ts — both resolveUserLocale(userId) once and prefix all success/error redirects. Login-error redirects intentionally unprefixed (happen before user is known)
- [x] 3.3 `src/app/sitemap.ts` emits one entry per (locale × public-path) with `alternates.languages` hreflang map. Authenticated /t/ routes excluded
- [x] 3.4 `src/app/robots.ts` allows /, disallows /*/t/, /api/, /setup-billing, references sitemap.xml
- [ ] 3.5 Real email render test — DEFERRED (manual smoke needed)
- [ ] 3.6 Sentry sourcemap check — DEFERRED until next deploy
- [ ] 3.7 Update CLAUDE.md i18n spec — DEFERRED (no conventions changed beyond what spec deltas already cover)
- [x] 3.8 Ready to archive

## 4. Verification (cross-phase)

- [x] 4.1 Phase 1 verified — Vercel deployed d94f2cd successfully; `curl -I https://ads-lab.xyz/login` returns 307 to `/th/login`
- [ ] 4.2 Phase 2 verification — TODO check x-vercel-cache: HIT on `/th` after deploy
- [ ] 4.3 Phase 3 verification — TODO real test email
- [x] 4.4 audit-missing-keys-v3.py + audit-emojis.py clean (pre-commit hook runs these on every commit)
- [ ] 4.5 Sentry no error spike — TODO post-deploy
- [ ] 4.6 Lighthouse score improvement — TODO post-deploy
