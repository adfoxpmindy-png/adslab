# AdsLab i18n smoke tests

Playwright tests that catch the class of bug that broke us 5 times during the
2026-05-18/19 i18n migration: translation keys referenced by `t()` but missing
from the dictionary → render-time `MISSING_MESSAGE` crash.

`tsc --noEmit` and `scripts/audit-missing-keys-v3.py` catch STATIC missing
keys. These smoke tests catch DYNAMIC misses that only fail at runtime
(e.g., `t.rich("key", { email })` where the translation value drifts between
locales — exactly how `/data-deletion` HTTP 500'd on the Thai locale only).

## Run

```bash
npm run test:smoke          # headless, 24 tests (~22s)
npm run test:smoke:headed   # with browser UI
```

The Playwright config (`playwright.config.ts`) auto-spawns `npm run dev` if a
dev server isn't already running on port 3000. Reuses an existing one when
present (`reuseExistingServer: !CI`).

## What the tests check

For each of 8 public routes × 3 locales (= 24 tests):

1. **HTTP status < 400** — page renders without server error
2. **No `MISSING_MESSAGE` / `MISSING_VALUE`** in the rendered HTML
3. **`<html lang="...">` matches the cookie locale** — middleware correctly
   reads the `adslab-locale` cookie
4. **Locale signal in body text** — at least one Thai/English/Lao fragment
   appears, catching "rendered the wrong dict" bugs
5. **No `MISSING_MESSAGE`-shaped console errors** during render

Routes covered: `/`, `/login`, `/signup`, `/refund-policy`, `/terms`,
`/privacy`, `/data-deletion`, `/verify-email`.

Locales: `th`, `en`, `lo`.

## Adding a new route

1. Append to `PUBLIC_ROUTES` in `i18n-smoke.spec.ts`
2. Add at least one short locale-specific fragment to `LOCALE_HOOKS` if the
   new route uses unusual vocabulary (most existing fragments — e.g.,
   "ยืนยัน", "Sign", "ສະໝັກ" — match many pages)
3. `npm run test:smoke` to verify

## Adding tenant / auth-gated routes

The smoke tests intentionally only cover PUBLIC routes (no DB / auth needed).
Tenant routes like `/t/<slug>/dashboard` need session cookies + tenant
membership in the DB, which adds complexity. For those:

- Use a separate auth fixture (sign-in via `/api/auth/login` to set the
  session cookie before each test)
- Seed a known tenant via `prisma/seed/*.ts`
- Add to a separate `tenant-routes.spec.ts`

## CI integration (not yet wired)

Add to `.github/workflows/ci.yml`:

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run test:smoke
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}  # required by `next dev`
```

## Why not URL-prefix locales?

next-intl supports `/th/login` style URL prefixes. AdsLab uses
cookie-only locale detection (`adslab-locale` cookie) so the URL stays
locale-agnostic — see `src/i18n/request.ts`. The smoke tests set the
cookie via `setExtraHTTPHeaders({ Cookie: 'adslab-locale=...' })`.
