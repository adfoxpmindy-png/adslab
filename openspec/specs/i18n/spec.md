## ADDED Requirements

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
The system SHALL detect the user's active locale via the `adslab-locale` cookie. When absent, fall back to the `Accept-Language` HTTP header; when that's absent or unrecognized, fall back to `"th"`.

The locale resolution happens in `src/middleware.ts` so every server-rendered page sees the correct locale.

#### Scenario: First-time visitor with Lao browser
- **WHEN** a user visits the app for the first time with `Accept-Language: lo,en;q=0.9`
- **THEN** the middleware sets `adslab-locale=lo` cookie and the page renders in Lao

#### Scenario: Logged-in user with stored preference
- **WHEN** a user logs in and their `User.preferredLocale` is `"en"`
- **THEN** the login response sets `adslab-locale=en` cookie regardless of `Accept-Language`

### Requirement: Per-user locale preference
The system SHALL persist each user's chosen locale on `User.preferredLocale` (default `"th"`). The language switcher in the sidebar dropdown lets the user change it; the new choice updates BOTH the DB column AND the `adslab-locale` cookie immediately.

#### Scenario: Change locale via switcher
- **WHEN** the user clicks "English" in the language switcher
- **THEN** `User.preferredLocale` is updated to `"en"`, the `adslab-locale` cookie is rewritten, and the page reloads in English

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

#### Scenario: Date format consistency across locales
- **WHEN** a campaign was created on 2026-05-17 and is displayed in three different user locales
- **THEN** `th` shows "17 พ.ค. 2026", `en` shows "17 May 2026", `lo` shows "17 ພ.ຄ. 2026"

### Requirement: Language switcher in sidebar dropdown
The system SHALL surface a language switcher inside the user-profile dropdown menu at the sidebar bottom (alongside Profile / Settings / Logout). The switcher shows three options with the language's own name as label: `"ไทย"`, `"English"`, `"ລາວ (beta)"`. The active locale is marked with a checkmark.

The "(beta)" label on Lao communicates that translations may be incomplete.

#### Scenario: Switcher visible to every authenticated user
- **WHEN** a user opens the sidebar profile dropdown
- **THEN** they see "ภาษา" submenu (or inline section) with the three options and a checkmark next to their current locale

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
