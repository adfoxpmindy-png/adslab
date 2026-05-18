# Complete i18n migration + emoji sweep + locale-aware formatting

## Status
Implemented and verified on 2026-05-18 / 2026-05-19.

## Problem
After the initial i18n foundation (cookie locale, dictionaries, language switcher, AI locale plumbing) shipped, the actual migration of hardcoded Thai strings was incomplete:
- ~152 source files held ~33,557 hardcoded Thai characters
- 108 decorative emojis cluttered the UI (user feedback: "ไม่สวยเลย"); 180 more lived in translation values
- 43 calls to `toLocaleString("th-TH")` / `Intl.NumberFormat("th-TH")` / `toLocaleDateString("th-TH")` hardcoded the locale, so English / Lao users saw Buddhist Era dates and Thai-grouped numbers
- 5 native `<input type="date">` / `<input type="datetime-local">` controls bypassed our locale-aware DatePicker
- 6 translation keys (`pages.events.*`) were referenced in code but missing from every locale file — would crash the events page at render time with `MISSING_MESSAGE`

The user pushed back on completion claims 5 times before the migration actually held under deep verification.

## Solution
Sweep every layer and back the work with a 7-check verification matrix that proves completeness instead of asserting it.

### Migration
- All user-facing components converted to `useTranslations` / `getTranslations`; helper sub-components each call the hook directly (no `t` prop drilling)
- AI prompt bodies (`prompt.ts`, `chat-service.ts`, `campaign-plan/route.ts`, `boost-parser.ts`) converted to English — `LOCALE_DIRECTIVE` steers output language; English prompt body shares one prompt-cache entry across locales
- Email templates (`verify-email.ts`, `billing.ts`, `daily-report.ts`) refactored to accept a `locale: Locale` parameter; every call site now resolves the recipient's locale via `resolveUserLocale(userId)`
- Server libs returning user-facing errors (`adset-actions`, `campaign-actions`, `campaign-create`, `duplicate-campaign`, `page-posts`, `url-resolver`, `creatives/service`, `meta/images`, `boost/plan`, `auth/email-verification`, `billing/gate`) accept `locale: Locale` and use `getTranslations({ locale, namespace })`

### Emoji cleanup
- 108 emojis stripped from src/ (excluding `src/generated/*`)
- 180 emojis stripped from `messages/{th,en,lo}.json` values
- AI prompt section markers (`📊 🏆 ⚠️ 🔧 🎨 🌐 💰 ⚙️ 💡 🎯 ✨`) removed so the model stops mirroring them in output
- JSX glyphs swapped for lucide-react icons (✓ → `<Check>`, 🎬 → `<Video>`, ⚠ → `<AlertTriangle>`, 🌐 → `<Globe>`, 💡 → `<Lightbulb>`, etc.)

### Locale-aware formatting
- 43 hardcoded `toLocaleString("th-TH")` / `toLocaleDateString("th-TH")` / `Intl.NumberFormat("th-TH")` calls replaced with `formatDate` / `formatDateTime` / `formatNumber` / `formatCurrency` from `src/lib/i18n/format.ts`
- Module-level `thbFormatter` constants refactored into functions taking `locale: Locale`
- 5 native `<input type="date">` / `<input type="datetime-local">` inputs swapped for the existing locale-aware `<DatePicker>` component (with `showTime` prop for datetime variants)
- AI-internal `summarize()` formatters that produce English-only LLM context use `"en-US"` instead of `"th-TH"`

### Bug fixed
- Added `pages.events.{logPageTitle,logPageSubtitle,log.allEvents,log.allStatuses,log.loading,log.empty}` to all 3 locale files. Without these the SDK Event Log page would have crashed with `MISSING_MESSAGE` in any locale.

### Verification process (now baked into the i18n spec)
Seven checks must pass before claiming completion. Single-dimension verification missed real bugs across 5 rounds of pushback; the missing-key audit (`scripts/audit-missing-keys-v3.py`) is the only check that catches runtime crashes from `t("nonexistent.key")` calls — `tsc` and `npm run build` are blind to them.

## Outcome
- 0 unintentional Thai chars in src/ (140 remaining = `฿` currency + 4 documented intentional files)
- 0 emojis in src/ + 0 in `messages/*.json`
- 0 hardcoded th-TH locale formatters
- 0 native date inputs in JSX
- 0 missing translation keys
- 2,365 keys × 3 locales, matching trees
- `tsc --noEmit` clean
- `npm run build` succeeds

## Out of scope
- Browser smoke testing in all 3 locales (manual eyeball pass remains)
- Lao translation quality review by a native speaker (sub-agents produced first-pass Lao)
- Timezone display polish (currently uses browser TZ for every locale)
