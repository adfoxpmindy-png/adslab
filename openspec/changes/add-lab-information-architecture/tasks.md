## 1. Phase 1 — Build Lab pages + new sidebar (deployable on its own)

- [ ] 1.1 Create `src/components/ui-system/lab-page.tsx` exporting `<LabPage>` component (header with title + Lab badge + description tooltip, tab strip below header, content slot below tabs). Include keyboard-accessible tabs (arrow keys, role=tablist)
- [ ] 1.2 Add i18n keys under `pages.insightsLab`, `pages.launchLab`, `pages.inventoryLab`, `pages.aiLab`, `pages.automationLab` in all 3 locale JSONs (each: `title`, `description`, plus `tabs.<key>` for each sub-tab name). OLD keys (`pages.dashboard.*` etc.) stay untouched
- [ ] 1.3 Create `src/app/[locale]/insights-lab/page.tsx` (default tab = overview) + `overview/page.tsx` + `reports/page.tsx` + `reports/[reportId]/page.tsx` + `journey/page.tsx` + `competitors/page.tsx`. Each NEW page imports the corresponding existing route's default-exported page component (no content duplication; just re-export inside the LabPage wrapper)
- [ ] 1.4 Create `src/app/[locale]/launch-lab/page.tsx` (default = boost) + `boost/page.tsx` + `campaigns/page.tsx` + `manual-new/page.tsx` + `ai-new/page.tsx` + `history/page.tsx`. Same import-and-re-export pattern
- [ ] 1.5 Create `src/app/[locale]/inventory-lab/page.tsx` (default = ads) + `ads/page.tsx` + `audiences/page.tsx` + `creatives/page.tsx` + `posts/page.tsx` + `posts/new/page.tsx`
- [ ] 1.6 Create `src/app/[locale]/ai-lab/page.tsx` (default = chat) + `chat/page.tsx` + `recommendations/page.tsx` + `memory/page.tsx`
- [ ] 1.7 Create `src/app/[locale]/automation-lab/page.tsx` (default = rules) + `rules/page.tsx` + `goals/page.tsx` + `naming/page.tsx` + `events/page.tsx`
- [ ] 1.8 Update `src/components/tenant/sidebar-nav-items.ts` to list exactly 6 items (Insights Lab, Launch Lab, Inventory Lab, AI Lab, Automation Lab, Settings) with the icon set from spec
- [ ] 1.9 Update `src/components/tenant/sidebar-v2.tsx` and `src/components/tenant/mobile-sidebar.tsx` to render the new 6-item list (already iterates `SIDEBAR_NAV_ITEMS`; should be no-op if data source updated)
- [ ] 1.10 `npx tsc --noEmit` clean
- [ ] 1.11 Run dev server. Manually verify sidebar shows 6 items, each Lab loads with its default tab, tab strip switches sub-tabs without full reload
- [ ] 1.12 Deploy Phase 1. At this point old URLs (`/dashboard`, `/boost`, ...) still work AND new Lab URLs work. Sidebar points at new URLs

## 2. Phase 2 — Move canonical paths + add redirects

- [ ] 2.1 Extend `src/middleware.ts` with the legacy → Lab redirect map (see spec.md table). Each redirect is 307. Preserve locale prefix when redirecting (`/dashboard` → `/<locale>/insights-lab/overview`)
- [ ] 2.2 Move the actual page content from `src/app/[locale]/dashboard/page.tsx` INTO `src/app/[locale]/insights-lab/overview/page.tsx` (un-do the Phase 1 re-export pattern). Delete the old `dashboard/page.tsx`. Repeat for every legacy route
- [ ] 2.3 Update `tests/e2e/i18n-smoke.spec.ts` PUBLIC_ROUTES and `tests/e2e/screenshots.spec.ts` ROUTES to use Lab URLs (e.g. `/insights-lab/overview` instead of `/dashboard`)
- [ ] 2.4 Update `LOCALE_HOOKS` text fragments if any of the displayed text changes
- [ ] 2.5 `npm run verify` clean
- [ ] 2.6 `npm run test:smoke` 24/24 pass
- [ ] 2.7 Deploy Phase 2. Visit each legacy URL manually and confirm it 307-redirects to the Lab path. Confirm bookmark to `/dashboard` lands user on `/insights-lab/overview`

## 3. Phase 3 — i18n key migration + cleanup

- [ ] 3.1 Codemod (or sed) replaces `useTranslations("pages.dashboard")` → `useTranslations("pages.insightsLab.overview")` across `src/**/*.{ts,tsx}`. Repeat for every old namespace
- [ ] 3.2 Re-key the JSON: in `messages/th.json`, move `pages.dashboard.*` subtree → `pages.insightsLab.overview.*`. Same for en + lo. Use `jq` or a small Python script
- [ ] 3.3 `audit-missing-keys-v3.py` returns 0 missing + 0 drift
- [ ] 3.4 `npx tsc --noEmit` clean (typed messages re-validate against new JSON shape)
- [ ] 3.5 Delete old top-level page directories that are now empty (`src/app/[locale]/dashboard/`, `boost/`, etc.) if Phase 2 hasn't already
- [ ] 3.6 Delete `src/app/[locale]/tools/page.tsx` (the redundant hub) + update redirect map so `/tools` → `/insights-lab/overview`
- [ ] 3.7 Update `CLAUDE.md` (or equivalent project docs) to reference the new Lab structure in any "how to navigate" sections
- [ ] 3.8 `npm run test:smoke` 24/24 pass
- [ ] 3.9 Deploy Phase 3. `openspec archive add-lab-information-architecture`

## 4. Verification (cross-phase)

- [ ] 4.1 After Phase 1: open browser, click each of 6 sidebar items, confirm Lab page renders with correct default tab. Click each sub-tab, confirm URL updates without full reload
- [ ] 4.2 After Phase 2: `curl -I https://ads-lab.xyz/<locale>/dashboard` returns 307 → `/<locale>/insights-lab/overview`
- [ ] 4.3 After Phase 3: `audit-missing-keys-v3.py` AND `audit-emojis.py` both clean. `npm run verify` green
- [ ] 4.4 Sentry shows no new errors above baseline 30 minutes after each Phase ships
- [ ] 4.5 Lighthouse score on `/insights-lab/overview` ≥ Lighthouse score on the original `/dashboard` (no regression from the wrapper component)
- [ ] 4.6 Founder's daily workflow tested end-to-end: open Insights Lab → see ROAS yesterday → open AI Lab Chat → ask question → open Launch Lab Boost → boost a post. No 404, no MISSING_MESSAGE, all tabs reachable

## 5. Composition with add-isr-via-locale-url-prefix

- [ ] 5.1 Confirm `add-isr-via-locale-url-prefix` Phase 1 is DONE (locale prefix scaffold + middleware redirect for legacy URLs ships) BEFORE starting this proposal's Phase 1
- [ ] 5.2 Confirm `add-isr-via-locale-url-prefix` Phase 2 (link migration codemod) is NOT YET DONE when this proposal's Phase 2 ships — otherwise the codemod runs against legacy paths that no longer exist
- [ ] 5.3 After this proposal's Phase 3 completes, the locale-prefix proposal's Phase 2 + 3 can resume (codemod targets Lab URLs from the start)
