## Context

Phase 1–9 of AdsLab assumed a Thai-only audience. The founder serves the Thai+Lao market and consults with English-speaking integrators; ~300 hardcoded Thai strings now live across the codebase, plus several AI prompts that bias the model toward Thai or English. The founder explicitly clarified 2026-05-17 that the platform supports **three languages**: ไทย, English, ລາວ.

The Thai-only baseline is actually an opportunity — it's much smaller than retrofitting English-first apps to Thai (which we'd have done if we'd built English-first). Three hundred strings is a one-week effort, not a one-quarter rewrite.

Constraints:
- Next.js 16 App Router (Server + Client components mixed).
- Tailwind v4, Base UI primitives, shadcn — no Material-UI-style i18n built in.
- Existing code uses `toLocaleString("th-TH", …)` ad-hoc in 50+ places — needs cleanup.
- Some AI providers (OpenRouter → Claude / Gemini) are happy in Thai+English but Lao quality is unproven.

## Goals / Non-Goals

**Goals:**
- A single `t("key")` function that resolves the active locale to a Thai / English / Lao string.
- User picks their locale once (saved per-user) and the UI follows on every page.
- AI-generated text (Daily Report, Chat, vision, knowledge) respects the user's locale.
- Progressive migration — adopting i18n component-by-component without breaking unmigrated ones.
- Lao gracefully falls back to Thai when a key is missing (since Thai readers can mostly parse Lao and vice versa; Thai is the safer fallback than English for the SE-Asia user base).

**Non-Goals:**
- URL-prefixed routing (`/en/…`) — cookie-based detection is simpler and matches the Thai SaaS norm.
- Translating user-generated content (campaign names, captions, knowledge documents).
- RTL languages.
- Per-tenant locale overrides — locale is per-user.
- Lao native-speaker QA pass — schedule that AFTER v1 ships when we know what real Lao users hit.

## Decisions

### D1: Library choice — `next-intl` over hand-rolled
**Choice:** Adopt `next-intl` for the i18n layer.

**Why over alternatives:**
- First-class Next.js App Router support (server + client components, RSC streaming).
- Zero-cost API on server (`getTranslations(...)` resolves at render time).
- Built-in `useTranslations(...)` hook for client components.
- ~30kb bundled gzipped — acceptable for an app that already ships React + Prisma client.
- Active maintenance; lots of community Q&A.

**Trade-off:** New dependency. Risk: 1-2 lock-in. Mitigation: the `t()` API is industry-standard; if we ever rip out next-intl, the call sites stay (we'd swap the provider).

### D2: Cookie-based locale detection — no URL prefix
**Choice:** Detect locale from `adslab-locale` cookie. Default fallback chain: cookie → `Accept-Language` header → `"th"`.

**Why over URL-prefix (`/en/…`):**
- URL-prefix is friendlier for public marketing landing pages where SEO matters. We don't ship those at /t/[slug]/... — that's all auth-gated.
- Cookie persists across logins on the same browser, no `useEffect` flicker.
- One less moving piece in routing.

**Trade-off:** Bookmarked links don't encode locale. Acceptable — locale is per-user, not per-link.

### D3: User-level locale, not tenant-level
**Choice:** Store `preferredLocale` on `User`, not `Tenant` or `TenantMember`.

**Why:**
- A Thai agency operator with a Lao client should still see their own dashboard in Thai. Their Lao colleague who's also a member of the same tenant sees it in Lao.
- Mirrors the dark/light theme decision (per-user) and avoids the "whose locale wins" question.

**Trade-off:** Reports surfaced to OTHER team members (e.g., a Daily Report PDF) are generated in the report-creator's locale at generation time. The locale at read-time isn't applied. Acceptable — reports are point-in-time snapshots.

### D4: AI prompts take a `locale` argument; no automatic re-prompting
**Choice:** Every AI prompt that emits user-facing text accepts `locale: "th" | "en" | "lo"` and bakes a sentence into the system prompt:

```
locale === "th" → "ตอบเป็นภาษาไทย ใช้คำศัพท์ media buyer ไทย ทับศัพท์ภาษาอังกฤษ (ROAS, CTA, Reels) ใช้ได้"
locale === "en" → "Respond in English. Industry terms in English."
locale === "lo" → "ຕອບເປັນພາສາລາວ. ສະຫງວນຄຳສັບອຸດສາຫະກຳພາສາອັງກິດ (ROAS, CTA, Reels)."
```

**Why:** Simple, deterministic, no extra LLM round-trip to translate. Compatible with prompt caching since the locale string is short.

**Trade-off:** If the model occasionally drifts into English when asked for Thai, we don't auto-retranslate. We accept the drift in v1 and fix per prompt as observed. The cost of automatic translation (an extra LLM call) isn't justified for a 5% drift rate.

### D5: Lao falls back to Thai, not English
**Choice:** When a key is missing in `lo.json`, fall back to `th.json` (not `en.json`).

**Why:**
- Thai and Lao share script roots and many borrowed words; a Lao speaker can decode Thai better than English.
- Spares us from translating every key into both languages on day one.
- Default `next-intl` fallback chain is configurable to support this.

**Trade-off:** A "purist" Lao-only user sees mixed-language UI for a while. Acceptable — and a feature-detection moment ("hey, this string isn't translated yet — DM us") rather than a bug.

### D6: Source-of-truth language is Thai
**Choice:** `th.json` is the authoritative dictionary. English and Lao are derived. New strings ALWAYS land in Thai first.

**Why:**
- The founder writes content in Thai. Reviewing translations is easier than original drafts.
- Claude translates Thai → English / Lao well; the reverse direction has rougher edges (English idioms get awkward Thai literal translations).

**Trade-off:** External contributors (e.g., an English-first dev) need a translator buddy. Acceptable for now — team is small.

### D7: Translation key naming — flat keys, namespaced
**Choice:** Keys like `"sidebar.nav.dashboard"`, `"reports.title"`, `"posts.cta.create"`. Flat dot-paths, not nested objects.

**Why:**
- Easier grep ("find all uses of this key").
- next-intl handles dot-paths natively.
- Nested objects are hard to refactor (moving a key changes its path).

### D8: Migration order — high-traffic shared components first
1. Sidebar (`SIDEBAR_NAV_ITEMS`) — every page shows it
2. Topbar (page titles via `SetPageTitle`) — every page sets it
3. Common buttons / labels (forms, status badges)
4. Dashboard
5. Campaigns + Ads
6. Reports + AI Memory
7. Posts (new) + Audiences + Creatives
8. Settings

This ordering means each PR makes more pages "fully translated" than the last, and the founder can demo progress weekly.

## Risks / Trade-offs

- **Risk:** Lao quality from machine translation is uneven; some terms may be awkward.
  → Mitigation: ship v1 with the disclaimer "ລາວ — ບໍ່ສະຫມັບປຸ່ມ" (Lao — beta) and an in-app feedback button to flag bad translations. Native-speaker pass after launch.

- **Risk:** AI providers may not generate good Lao for technical media-buyer content (smaller training data).
  → Mitigation: when generating Lao AI output, also include the English version below the Lao in early days so the user can compare. Hidden behind `FEATURE_AI_LO_DUAL` env, deprecated when quality is confirmed.

- **Risk:** Translation drift — strings get added in Thai but English/Lao dictionaries lag behind.
  → Mitigation: CI script that diffs key sets across the 3 JSON files and warns when th has keys that en/lo are missing (just a warning, not a build failure, so it doesn't block urgent fixes).

- **Risk:** `next-intl` doesn't ship a built-in locale switcher UI; we build our own.
  → Acceptable — it's a 50-line dropdown component.

- **Risk:** Some `toLocaleString("th-TH", ...)` calls scattered through the codebase need locale plumbing.
  → Mitigation: create `src/lib/i18n/format.ts` with `formatDateTime(date, locale)` and `formatCurrency(num, locale, currency)`. Migrate call sites opportunistically during the page-by-page i18n pass.

## Migration Plan

1. **Phase A** (~2 days, single PR):
   - Install `next-intl`, set up `messages/{th,en,lo}.json`, add middleware for cookie-based locale detection.
   - Add `User.preferredLocale` column + migration.
   - Add language switcher dropdown (3 options, with "Lao (beta)" label).
   - Update `/api/auth/login` to set cookie.
   - Wire i18n into AI prompt plumbing (Daily Report, Chat, vision tool).
   - Migrate sidebar + topbar to use `t()`.

2. **Phase B** (~2-3 days, second PR):
   - Generate Lao dictionary with Claude.
   - Page-by-page migration of hardcoded strings in priority order (D8).
   - Replace `"th-TH"` in `toLocaleString` calls with the new `formatDateTime`/`formatCurrency` helpers.
   - Add CI diff script.

**Rollback:** Hide the language switcher and force cookie to `"th"`. Existing Thai users see no change.

## Open Questions

- **Q:** Should the language switcher live in the sidebar bottom dropdown (alongside ออกจากระบบ) or the topbar?
  → Sidebar dropdown — keeps it discoverable but not in the user's face. The topbar is busy with page title + tenant switcher + theme toggle + notifications.

- **Q:** Should we machine-translate the existing 102 Nick Theriot knowledge chunks (which are English transcripts) into Thai + Lao?
  → No — the knowledge base AI synthesizes in the user's locale at chat time. The raw chunks staying English is fine because they're never shown to users directly (only the synthesized output).

- **Q:** Lao font support on every OS?
  → System default fonts cover Lao on macOS, Windows 10+, iOS, Android. Good enough; no custom Lao webfont needed in v1.
