## Purpose

Localize the AdsLab UI for Thai-first users with English and Lao as alternates. Every UI string, AI prompt, date formatter, and email template must respect the active locale; missing translations fall back to Thai. Locale resolution happens via URL prefix (`/<locale>/...`) with cookie + Accept-Language as legacy fallbacks for unprefixed bookmarks.
## Requirements
### Requirement: Three-language translation library
The system SHALL provide a translation function `t(key, params?)` resolving the active locale (one of `"th"`, `"en"`, `"lo"`) to a localized string from `messages/{locale}.json` dictionaries. Thai is the source-of-truth; missing keys in `en.json` or `lo.json` fall back to Thai.

The library MUST work in both Server Components (via `getTranslations()`) and Client Components (via `useTranslations()` hook).

#### Scenario: Key exists in all three dictionaries
- **WHEN** a component calls `t("sidebar.nav.dashboard")` and the user's locale is `"en"`
- **THEN** the function returns `"Overview"` (the value from `messages/en.json`)

#### Scenario: Key missing in Lao
- **WHEN** a component calls `t("posts.cta.create")` with locale `"lo"` and the key exists only in `th.json`
- **THEN** the function returns the Thai value as fallback

#### Scenario: Parameter interpolation
- **WHEN** a component calls `t("greeting.welcome", { name: "Pisit" })` and the dictionary entry is `"สวัสดี {name}"`
- **THEN** the function returns `"สวัสดี Pisit"`

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

### Requirement: AI prompts respect user locale
Every AI-generated user-facing string MUST be produced in the active locale. This applies to: Daily Report, Chat assistant, vision creative analysis (`analyzeAdCreative`), auto-rules suggest, knowledge synthesis, and any future AI-output surface.

Prompts MUST include a locale directive line near the top of the system prompt that maps `th | en | lo` to a Thai / English / Lao response instruction. Industry vocabulary (ROAS, CTA, Reels, brand names) MAY remain in English regardless of locale.

#### Scenario: Daily Report in English
- **WHEN** the user's locale is `"en"` and the daily-report cron generates a report for that user
- **THEN** the report markdown body is in English, but campaign names, account names, and metric labels (ROAS, CTR, CPM) stay as-is

#### Scenario: Vision creative analysis in Lao
- **WHEN** the user with locale `"lo"` calls `analyzeAdCreative` on an ad
- **THEN** the returned JSON's string fields (hook, emotionalTone, dominantColor, strengths, weaknesses, suggestedFixes) are in Lao

#### Scenario: Chat in Thai (default)
- **WHEN** the user has no locale preference set (default `"th"`) and chats with the AI
- **THEN** the AI responds in Thai

### Requirement: Date / number formatting honors locale
The system SHALL provide `formatDateTime(date, locale)` and `formatCurrency(amount, locale, currency)` helpers in `src/lib/i18n/format.ts`. Component code MUST use these helpers instead of hardcoding `toLocaleString("th-TH", ...)` calls.

The helpers wrap `Intl.DateTimeFormat` / `Intl.NumberFormat` with the active locale and consistent options (numeric day + short month + 24-hour time for dates; THB symbol with no fractional digits for currency).

The `locale` value comes from `getLocale()` server-side (which reads `params.locale` from the URL segment in the new routing) or `useLocale()` client-side.

#### Scenario: Date format consistency across locales
- **WHEN** a campaign was created on 2026-05-17 and is displayed in three different user locales
- **THEN** `/th` shows "17 พ.ค. 2026", `/en` shows "17 May 2026", `/lo` shows "17 ພ.ຄ. 2026"

### Requirement: Language switcher in sidebar dropdown
The system SHALL surface a language switcher inside the user-profile dropdown menu at the sidebar bottom (alongside Profile / Settings / Logout). The sidebar's TOP section displays exactly six top-level Lab/Settings nav items (no more "Tools" hub, no more 13-item flat list). The switcher itself is unchanged in behavior; it still shows three options with the language's own name as label.

#### Scenario: Sidebar shows exactly six items
- **WHEN** a logged-in user opens the sidebar
- **THEN** the visible top-level items are: Insights Lab, Launch Lab, Inventory Lab, AI Lab, Automation Lab, Settings — in that order — each with its lucide icon. No "Tools", no "Dashboard", no "Reports" as separate items

#### Scenario: Active Lab highlights the right item
- **WHEN** the URL is `/insights-lab/journey`
- **THEN** the "Insights Lab" sidebar item shows the active style; clicking any sibling Lab navigates without losing the locale prefix

### Requirement: CI keyset diff warning
The CI pipeline SHALL run a script after every PR that compares the key sets of `th.json`, `en.json`, and `lo.json`. When `th.json` contains keys missing from `en.json` or `lo.json`, the script SHALL emit a warning (not a build failure) listing the missing keys.

#### Scenario: Developer adds a Thai-only key
- **WHEN** a developer commits a new key in `th.json` but forgets `en.json` / `lo.json`
- **THEN** the CI step prints a yellow warning naming the key and the missing locales, but the build still passes (so urgent fixes are unblocked)

### Requirement: Locale-aware date/time picker (no native HTML inputs)
The system SHALL use a custom `<DatePicker>` component at `src/components/ui/date-picker.tsx` for every date / datetime / time input in user-facing forms. Native `<input type="date">` and `<input type="datetime-local">` MUST NOT appear in JSX because the browser default UI is inconsistent across OSes and unrelated to the app's active locale.

The picker reads `common.datePicker.{months,weekdays,yearOffset}` from the active locale's dictionary. `yearOffset` is `543` for Thai (Buddhist Era) and `0` for English / Lao (Gregorian).

#### Scenario: Thai user picks May 17, 2026
- **WHEN** a Thai user opens the campaign end-date picker
- **THEN** the displayed year is `2569` (BE), the months read "ม.ค." / "ก.พ." / etc., and the weekday row shows Thai abbreviations

#### Scenario: English user picks the same calendar date
- **WHEN** an English user opens the same picker and selects May 17, 2026
- **THEN** the displayed year is `2026` (Gregorian) and the ISO value returned to the form (`"2026-05-17"`) matches what the Thai user produces for the same calendar day

### Requirement: Verification matrix before declaring i18n-touching work "done"
Any task touching i18n (migration, refactor, new feature) MUST pass ALL of these checks before the implementer claims completion. Single-dimension verification has historically (5 rounds on 2026-05-18) missed real bugs.

1. `grep -rn "[ก-๛]" src --include="*.ts" --include="*.tsx"` returns only `฿` and the documented intentional skip files (locale self-names, AI prompt directives, sentence-split regex)
2. `grep -rnE 'toLocaleString\("th-TH"\)|toLocaleDateString\("th-TH"|Intl\.NumberFormat\("th-TH"|Intl\.DateTimeFormat\("th-TH"' src` returns 0
3. `grep -rn 'type="date"\|type="datetime-local"' src` returns 0 in JSX
4. `python scripts/audit-missing-keys-v3.py` returns 0 missing keys + 0 TH/EN/LO drift
5. `python scripts/audit-emojis.py` returns 0 for src + 0 for each locale JSON
6. `npx tsc --noEmit` clean
7. `npm run build` succeeds

Check #4 is the only one that catches `MISSING_MESSAGE` runtime crashes from `t("nonexistent.key")`. `tsc` and `build` do NOT detect missing translation keys.

#### Scenario: PR claims i18n feature is complete
- **WHEN** an engineer claims an i18n-touching feature is ready for review
- **THEN** the PR description must include green output for all 7 checks; partial completion is described honestly as "X/7 checks pass, Y deferred because Z"

### Requirement: No decorative emojis in UI / translations / AI prompts
UI text, translation values, and AI system prompts MUST NOT contain decorative emojis. Use lucide-react icon components for visual cues. Exceptions:
- `฿` (Baht currency sign for THB display)
- Locale self-names (`ไทย`, `English`, `ລາວ (beta)`)
- Regex literals that match Thai/Lao text characters

Decorative emojis in AI system prompts also bias the model to mirror them in output — strip at the source.

#### Scenario: Engineer writes a success toast
- **WHEN** an engineer writes `toast.success("✓ Saved")` in code or `"saved": "✅ Saved"` in a translation file
- **THEN** code review rejects it — use `toast.success(t("saved"))` with translation value `"Saved"` (no glyph) and rely on the toast library's built-in icon

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

### Requirement: Lab pages compose sub-pages under a tab strip
Every Lab page SHALL render a consistent header containing: page title, "Lab" badge, tab strip pinned below the header, and a description tooltip explaining what the Lab is for. The tab strip exposes the Lab's sub-tabs as horizontal links; clicking a tab navigates to `/<lab>/<tab>` and the current tab gets the active style.

The five required Labs and their sub-tabs:

| Lab | URL | Default tab | Sub-tabs |
|---|---|---|---|
| Insights Lab | `/insights-lab` | overview | overview, reports, journey, competitors |
| Launch Lab | `/launch-lab` | boost | boost, campaigns, manual-new, ai-new, history |
| Inventory Lab | `/inventory-lab` | ads | ads, audiences, creatives, posts |
| AI Lab | `/ai-lab` | chat | chat, recommendations, memory |
| Automation Lab | `/automation-lab` | rules | rules, goals, naming, events |

#### Scenario: Lab landing renders default tab
- **WHEN** a user visits `/insights-lab` (no sub-tab in URL)
- **THEN** the page renders the Insights Lab header + tab strip with "Overview" active + the dashboard content from the previous standalone `/dashboard` route

#### Scenario: Tab navigation updates URL
- **WHEN** a user on `/insights-lab/overview` clicks the "Reports" tab
- **THEN** the URL becomes `/insights-lab/reports` and the tab strip shows "Reports" active without a full-page reload

#### Scenario: Direct sub-tab URL works
- **WHEN** a user clicks an email link to `/insights-lab/reports/abc123` (a specific report)
- **THEN** the page loads with Insights Lab header + Reports tab active + report content for ID `abc123`

### Requirement: Legacy top-level URLs 307-redirect to the Lab path
For at least 90 days after this change ships, the middleware SHALL serve a 307 redirect from every removed top-level URL to its new Lab path. This composes with the legacy-URL redirect already required by `add-isr-via-locale-url-prefix` — both redirects run in a single middleware pass.

Redirect map (legacy → new):

| Legacy | New |
|---|---|
| `/dashboard` | `/insights-lab/overview` |
| `/reports` | `/insights-lab/reports` |
| `/reports/[id]` | `/insights-lab/reports/[id]` |
| `/journey` | `/insights-lab/journey` |
| `/competitors` | `/insights-lab/competitors` |
| `/boost` | `/launch-lab/boost` |
| `/campaigns` | `/launch-lab/campaigns` |
| `/campaigns/new` | `/launch-lab/manual-new` |
| `/campaigns/ai-new` | `/launch-lab/ai-new` |
| `/campaigns/history` | `/launch-lab/history` |
| `/ads` | `/inventory-lab/ads` |
| `/audiences` | `/inventory-lab/audiences` |
| `/creatives` | `/inventory-lab/creatives` |
| `/posts`, `/posts/new` | `/inventory-lab/posts`, `/inventory-lab/posts/new` |
| `/ai` | `/ai-lab/chat` |
| `/ai/memory` | `/ai-lab/memory` |
| `/ai-optimize` | `/ai-lab/recommendations` |
| `/rules` | `/automation-lab/rules` |
| `/goals`, `/goals/naming` | `/automation-lab/goals`, `/automation-lab/naming` |
| `/events` | `/automation-lab/events` |
| `/tools` | `/insights-lab/overview` (no longer exists; redirect to dashboard) |

#### Scenario: Old bookmark to /dashboard
- **WHEN** a user with `adslab-locale=th` cookie visits `/dashboard` (or `/th/dashboard` after locale-prefix ships)
- **THEN** the response is 307 to `/th/insights-lab/overview` and the page loads as if the user had navigated there directly

#### Scenario: Old email CTA to /reports/xyz
- **WHEN** a user clicks `/reports/abc-123` from an email sent before this change
- **THEN** the response is 307 to `/<recipient-locale>/insights-lab/reports/abc-123`

### Requirement: i18n keys re-key under Lab namespaces
Translation keys under `pages.dashboard.*`, `pages.reports.*`, `pages.journey.*`, etc. SHALL migrate to `pages.insightsLab.overview.*`, `pages.insightsLab.reports.*`, `pages.insightsLab.journey.*` etc. The `audit-missing-keys-v3.py` script MUST report 0 missing keys at the end of the migration; the per-locale key tree drift MUST remain 0.

Old key paths MAY remain in the JSON dictionaries during a transition (no harm — they're orphan keys, not referenced by code). Phase 3 of the tasks deletes orphans.

#### Scenario: All references updated atomically
- **WHEN** running `npm run audit:i18n` after the i18n key re-key migration
- **THEN** "TRULY MISSING translation keys: 0" and "TH/EN/LO drift: 0 / 0 / 0" — no `t("oldKey")` references remain in code with no corresponding JSON value

