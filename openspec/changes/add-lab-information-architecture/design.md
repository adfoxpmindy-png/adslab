## Context

AdsLab today exposes 13 top-level sidebar nav items plus a `/tools` hub page that links to 8 of those same items. The founder (primary user) runs 31 Meta ad accounts daily; he scans the sidebar 50+ times a day and the flat menu has no grouping logic. New users (future agencies onboarding) face the same flat menu without semantic anchors — "Boost", "Campaigns", "Ads" all sound like they could be the same thing; "AI Chat", "AI Optimize", "AI Memory" are spread across 3 separate slots.

The product is named **AdsLab**. The "Lab" metaphor is on the table for the taking — group related tools as "Labs", each with internal tabs. Five Labs (Insights, Launch, Inventory, AI, Automation) cleanly cover 21 of the current 22 user-facing routes, with `/tools` deleted as a redundant hub.

Coordinates with `add-isr-via-locale-url-prefix` (also in `openspec/changes/`): both proposals change URLs. Executing them in the right order avoids touching the same route files twice and keeps each phase deployable.

Stakeholders: the founder (daily user), future paying agencies (onboarding friction), search engines (URL stability via 307 redirects).

## Goals / Non-Goals

**Goals:**
- Sidebar shrinks from 13 items → 6 (5 Labs + Settings) so first-time scanability < 2 sec
- Each Lab has a consistent header pattern (title + "Lab" badge + tab strip)
- Old bookmarks and email CTAs continue to work via 307 redirect for ≥ 90 days
- Composes cleanly with `add-isr-via-locale-url-prefix` — no double-touching files
- All Playwright smoke tests + missing-key audit pass at the end of every phase

**Non-Goals:**
- Changing what each tool DOES (no feature rewrite — only re-org)
- Removing tools (every existing page becomes a sub-tab; nothing deleted except `/tools` hub)
- Building "Creative Lab", "Tracking Lab", or other future Labs not in the current 5 (proposal only — defer to later changes)
- Visual redesign beyond the Lab pattern's header + tabs (cards/charts/forms in sub-tabs unchanged)
- Mobile-first reflow beyond what the existing nav already does

## Decisions

### D1. Lab URL pattern: `/<name>-lab/<sub-tab>` (default tab on bare Lab URL)

Each Lab lives at `/insights-lab`, `/launch-lab`, etc. The bare Lab URL renders the default sub-tab. Direct sub-tab URLs (`/insights-lab/reports`) work and bookmark cleanly.

Alternative considered: `/insights/<tab>` (no "-lab" suffix). Rejected because:
- "Insights" reads like a generic noun; "Insights Lab" carries the product's brand
- The `-lab` suffix is consistent with the product name (AdsLab → InsightsLab) and signals "this is a workbench of tools, not a single page"

Alternative considered: query params (`/lab?type=insights&tab=reports`). Rejected — ugly URLs, poor SEO, no browser back-button semantics.

### D2. Tab strip is rendered server-side; sub-tabs are real routes (not state)

Each sub-tab is a real Next.js route at `src/app/[locale]/<lab>-lab/<tab>/page.tsx`. The tab strip is just `<Link>` components highlighting the active route. No client-side state, no `useState` for which tab is active.

Why: Server-rendered tabs work without JS, get individual ISR cacheability (if applicable), bookmark cleanly, and integrate with the locale-prefix routing in `add-isr-via-locale-url-prefix` for free.

Alternative considered: client-side tabs with one route per Lab + tab content swapping in-place. Rejected because it loses URL-shareability of specific sub-tabs.

### D3. The Lab landing route renders the default sub-tab inline (no extra redirect)

`/insights-lab` (bare URL) renders the same content as `/insights-lab/overview` — they're alternate URLs for the same page. The landing route imports the default tab's content directly rather than redirecting.

Why: Avoids a 307 hop for the most common case (clicking the sidebar item). Both URLs render the same content; bookmarks to either work; the `<head>`'s `<link rel="canonical">` points to the explicit-tab variant for SEO clarity.

Alternative considered: `/insights-lab` → 307 redirect to `/insights-lab/overview`. Rejected because of the extra HTTP hop on the most-clicked link in the app.

### D4. Old URLs 307-redirect, not 301

Use 307 (temporary) not 301 (permanent) for the legacy URL redirects. After 90 days of stable traffic on new URLs we MAY upgrade to 301 in a follow-up change. Until then, 307 keeps the option to roll back without poisoning browser caches.

### D5. `/g` and `/tt` placeholders become a single "Coming soon" Lab tab inside Launch Lab

Rather than 2 separate placeholder routes hanging in the sidebar, fold Google + TikTok into a Launch Lab tab labeled "Other platforms (coming soon)". When real Google/TikTok support ships, this tab becomes the entry point.

Alternative considered: leave `/g` and `/tt` as separate top-level routes. Rejected because they add 2 sidebar items for 0 functionality.

### D6. Composition with `add-isr-via-locale-url-prefix`

The two proposals MUST execute in this order to avoid touching files twice:

**Step 1 (locale-prefix proposal): Phase 1 only.**
Move every `src/app/<path>` under `src/app/[locale]/<path>`. Build middleware that 307-redirects legacy `/login` → `/th/login`. After this step, all URLs are locale-prefixed but Lab IA is unchanged. Deploy.

**Step 2 (this proposal): all 3 phases.**
Build the 5 Lab pages under `src/app/[locale]/<lab>-lab/`. Move sub-pages, update sidebar nav, extend middleware redirect map to include the Lab map. Deploy each phase independently.

**Step 3 (locale-prefix proposal): Phase 2 + 3.**
Codemod `next/link` → `@/i18n/routing`, enable ISR on the (now-renamed) public pages, update emails. Deploy.

Sequencing rationale: the locale-prefix Phase 1 sets up the `[locale]` segment that this proposal builds on top of. Doing locale-prefix Phase 2 (link migration) BEFORE this proposal would migrate links twice — once to next-intl `<Link>`, then again when the Lab paths change. Doing it AFTER, the codemod handles both URL changes (locale prefix + Lab path) in one sweep.

The composition is documented as "Step 1 → Step 2 → Step 3" but can be collapsed if both proposals execute together; either way, don't run locale-prefix Phase 2 before this proposal completes.

### D7. i18n key migration is mechanical, not semantic

Translation keys re-key from `pages.dashboard.title` → `pages.insightsLab.overview.title`. The VALUES don't change. The migration is a structural rename of the JSON tree + a corresponding find/replace across `useTranslations("pages.dashboard")` → `useTranslations("pages.insightsLab.overview")` in source.

`audit-missing-keys-v3.py` catches any straggler at end of Phase 3. The auto-detected typed-message system (`global.d.ts`) re-types automatically when `messages/th.json` updates.

## Risks / Trade-offs

[Risk: legacy bookmarks/email-CTAs break for users on hot deploys] → Mitigated by 90-day 307 redirects layered in middleware. Caching not aggressive (307 stays 307), so rollback is cheap.

[Risk: `/tools` page deletion strands users who muscle-memory'd to it] → Mitigated by redirect `/tools → /insights-lab/overview` (the most common destination). Add a one-time toast on first visit explaining the new structure.

[Risk: ~250 internal `<Link>` href updates introduce typos / broken links] → Mitigated by (a) codemod for path-pattern replacements, (b) Playwright smoke testing every Lab page in 3 locales, (c) typed routes via Next.js typed-params (if enabled, would catch broken hrefs at tsc time).

[Risk: 150 i18n key re-keys break MISSING_MESSAGE coverage] → Mitigated by `audit-missing-keys-v3.py` running pre-commit + CI; tsc with typed-messages catches dead code references at compile time.

[Risk: this proposal duplicates work with `add-isr-via-locale-url-prefix`] → Explicitly addressed in D6: execute in the documented order. Each proposal's tasks.md references the other's status.

[Trade-off: Lab URLs like `/insights-lab/overview` are longer than `/dashboard`] → Accepted. The structural clarity is worth 16 extra chars in the URL bar.

[Trade-off: changing the URL of the most-clicked page (`/dashboard`) is high-blast-radius] → Accepted but mitigated by long-running 307 redirect.

## Migration Plan

**Phase 1 — Build Lab pages alongside existing routes (4-6 hours)**
1. Create `src/components/ui-system/lab-page.tsx` (the reusable header + tab-strip pattern).
2. For each Lab, create the index page + default tab page at `src/app/[locale]/<lab>-lab/<tab>/page.tsx`, IMPORTING the existing route's content as a server component. The old routes still exist and work; the new Lab routes mirror their content.
3. Update `sidebar-nav-items.ts` to point at the new Lab URLs.
4. Add i18n keys for the new Lab namespaces. OLD keys stay (no orphan deletion yet).
5. Deploy. Users see the new sidebar; both old and new URLs work.

**Phase 2 — Switch the canonical paths, add redirects (3-4 hours)**
6. Extend `src/middleware.ts` with the legacy URL → Lab path redirect map (see spec.md "Legacy top-level URLs 307-redirect to the Lab path").
7. Move the actual content of each route into the Lab path (no more importing). Delete the old route files.
8. Update Playwright smoke tests to use Lab URLs.
9. `npm run verify` clean, `npm run test:smoke` 24/24 pass.
10. Deploy. Old URLs now 307-redirect.

**Phase 3 — Clean up (1-2 hours)**
11. Re-key all i18n strings: `pages.dashboard.*` → `pages.insightsLab.overview.*` etc. Codemod-friendly.
12. Run `audit-missing-keys-v3.py` — must return 0.
13. Delete orphan keys in messages/*.json.
14. Delete `src/app/[locale]/tools/page.tsx` (the redundant hub).
15. Deploy. `openspec archive add-lab-information-architecture`.

**Rollback plan**
- If Phase 1 breaks rendering: revert the Phase 1 PR; old routes still active, sidebar reverts to flat list.
- If Phase 2 breaks the redirect: temporary patch deletes the middleware redirect block; old URLs return 404 but new Lab URLs still work.
- If Phase 3 breaks i18n: revert the i18n re-key; old keys still in JSON so `t("oldKey")` returns content.

## Open Questions

- Lab badge styling — small badge next to title, or just part of the title text "Insights Lab"? Decide during Phase 1 by previewing both in the founder's session.
- Should the bare `/<lab>-lab` URL canonicalize to `/<lab>-lab/<default-tab>` or stay as its own URL? Current D3 says "no redirect, both render same content". If SEO complains about duplicate content, add `<link rel="canonical">` pointing to the explicit-tab variant.
- Do we want a top-row global search / command palette that lets the user jump directly to a sub-tab regardless of which Lab they're in? Out of scope here, but the consolidated Lab IA makes that easier to build later.
