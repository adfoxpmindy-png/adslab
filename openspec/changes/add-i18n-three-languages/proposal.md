## Why

AdsLab today is Thai-only on the surface and English-leaning under the hood (some AI tools and system messages still emit English). The founder confirmed 2026-05-17 that the platform must support **three languages**: **ไทย / English / ລາວ (Lao)**. The Thai+Lao market overlap is real — Thai media buyers serve Lao SMEs, and Lao operators want a tool in their own language. English is the universal fallback for international consultants and integrators.

Going multilingual now (before a marketing push) is far cheaper than retrofitting hundreds of components later. The cost grows linearly with each translated string left behind.

The existing problem is two-layered:

- **UI strings** are hardcoded Thai everywhere (`"แคมเปญ"`, `"กลุ่มเป้าหมาย"`, etc.). No translation layer.
- **AI-generated output** — Daily Report, vision creative analysis, Chat — has Thai instructions in prompts but the model occasionally responds in English (one path was English-only until commit `9896657` fixed the vision tool). Lao is not requested anywhere.

Both need a coordinated solution.

## What Changes

### A. UI string extraction + translation library

- **NEW** `src/lib/i18n/` — a small i18n layer using a simple `t(key, params?)` function. Stack choice deferred to design.md but leaning toward [next-intl](https://next-intl-docs.vercel.app) for first-class App Router support; fallback is a hand-rolled `Record<Locale, Record<string, string>>` if we want zero new deps.
- **NEW** `messages/{th,en,lo}.json` — translation keys. Thai is the source-of-truth; English + Lao derived.
- **NEW** `src/middleware.ts` (or extend existing) — detect locale from cookie `adslab-locale` with fallback to `Accept-Language` header, default `th`.
- Replace hardcoded Thai strings in shared components first (sidebar, topbar, common buttons), then page-by-page in priority order: dashboard → campaigns → reports → ads → posts → memory → settings.
- **NEW** language switcher in the topbar's user dropdown (alongside ตั้งค่า / ออกจากระบบ).

### B. User locale preference

- **NEW** column `User.preferredLocale String @default("th")` (or extend `Tenant` if locale is tenant-scoped — design decision below).
- Update `/api/auth/login` to set the `adslab-locale` cookie based on the user's stored preference.
- The language switcher persists the new choice to the DB + updates the cookie immediately.

### C. AI prompts → respect user locale

- Every AI prompt that produces user-facing text (Daily Report, Chat, vision creative, auto-rules suggest, knowledge synthesis) MUST take a `locale` argument and instruct the model accordingly:
  - `th` → "ตอบเป็นภาษาไทย"
  - `en` → "Respond in English"
  - `lo` → "ຕອບເປັນພາສາລາວ" (note: Lao language has less training data; quality is best-effort and we tell the user that on the language switcher)
- Domain vocabulary (ROAS, CTA, Reels, brand names) passes through in English regardless of locale.

### D. Date / number / currency formatting

- Use `Intl.DateTimeFormat` and `Intl.NumberFormat` keyed off the locale instead of hardcoded `"th-TH"`.
- Currency stays THB on financial figures unless tenant has a non-THB Meta account (handled separately by existing `fx.ts`).

## Capabilities

### New Capabilities
- `i18n`: Three-language UI + AI-output system covering Thai, English, and Lao. Includes the translation library, locale detection middleware, user preference storage, language switcher UI, and the AI prompt-locale plumbing.

### Modified Capabilities
None at spec level — this is purely additive. Pages adopt i18n component-by-component during rollout.

## Impact

- **New deps** (likely): `next-intl`. ~30kb bundled. Decision in design.md.
- **New table column**: `User.preferredLocale`. Additive migration.
- **New env var**: none (default locale is built-in).
- **Translation work**: ~300 strings for v1. Thai is source-of-truth; English will be done by Claude (cheap); Lao by Claude with native-speaker review later.
- **Rollout**: progressive — `t()` function works against partial dictionaries (English/Lao fall back to Thai when missing). Each component migrating is independent.

## Out of Scope (deferred)

- **Right-to-left language support** (Arabic / Hebrew) — not in scope, no immediate users.
- **Translating user-supplied content** (e.g., a Thai-written caption shown to an English-locale user) — out of scope; users see captions in the original language.
- **Per-page locale URL routing** (`/en/dashboard`, `/lo/dashboard`) — defer to a follow-up; cookie-based detection is simpler for v1 and matches how most Thai SaaS tools handle it.
- **AI auto-translation between languages on demand** — separate concern.

## Estimated effort

~4-5 days end-to-end split into two PRs:
- **PR 1** (~2 days): i18n library setup + middleware + user preference + language switcher + Thai source dictionary + English fallback dictionary + AI prompt-locale plumbing.
- **PR 2** (~2-3 days): Lao dictionary (machine + manual pass) + page-by-page migration of hardcoded strings.
