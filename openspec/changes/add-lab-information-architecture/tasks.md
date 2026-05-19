## 1. Phase 1 — Build Lab pages + new sidebar (deployable on its own)

- [x] 1.1 Create `src/components/ui-system/lab-page.tsx` exporting `<LabPage>` component (header with title + Lab badge + description tooltip, tab strip below header, content slot below tabs). Include keyboard-accessible tabs (arrow keys, role=tablist)
- [x] 1.2 Add i18n keys under root `labs.{insights,launch,inventory,ai,automation}` namespace in all 3 locale JSONs (each: `title`, `description`, plus `tabs.<key>` for each sub-tab name). Lab namespace lives at root, not under `pages.*`, so legacy `pages.dashboard.*` keys stay untouched. Sidebar `nav` namespace gains 5 Lab labels alongside existing 13 entries
- [x] 1.3 Created `src/app/[locale]/t/[tenantSlug]/insights-lab/{layout.tsx, page.tsx, reports/page.tsx, reports/[reportId]/page.tsx, journey/page.tsx, competitors/page.tsx}`. Layout owns LabPage shell; each leaf page re-exports the existing route's default export with params/searchParams forwarded. Note: Labs are tenant-scoped (under `/t/[tenantSlug]/`) — diverges from spec's bare-URL form because existing routing is tenant-scoped
- [x] 1.4 Created `src/app/[locale]/t/[tenantSlug]/launch-lab/{layout.tsx, page.tsx (=boost), campaigns/page.tsx, new/page.tsx, ai-new/page.tsx, history/page.tsx}`. Same layout + re-export pattern
- [x] 1.5 Created `src/app/[locale]/t/[tenantSlug]/inventory-lab/{layout.tsx, page.tsx (=ads), audiences/page.tsx, creatives/page.tsx, posts/page.tsx, posts/new/page.tsx}`
- [x] 1.6 Created `src/app/[locale]/t/[tenantSlug]/ai-lab/{layout.tsx, page.tsx (=chat→ai), recommendations/page.tsx (→ai-optimize), memory/page.tsx (→ai/memory)}`
- [x] 1.7 Created `src/app/[locale]/t/[tenantSlug]/automation-lab/{layout.tsx, page.tsx (=rules), goals/page.tsx, naming/page.tsx (→goals/naming), events/page.tsx}`
- [x] 1.8 Updated `src/components/tenant/sidebar-nav-items.ts` to 6 items (Insights Lab, Launch Lab, Inventory Lab, AI Lab, Automation Lab, Settings) with FlaskConical/Rocket/Package/Brain/Workflow/Settings2 icons
- [x] 1.9 `sidebar-v2.tsx` and `mobile-sidebar.tsx` iterate `SIDEBAR_NAV_ITEMS` — automatic pickup of the new 6-item list, no code changes needed
- [x] 1.10 `npx tsc --noEmit` clean (0 errors)
- [ ] 1.11 Run dev server. Manually verify sidebar shows 6 items, each Lab loads with its default tab, tab strip switches sub-tabs without full reload
- [ ] 1.12 Deploy Phase 1. At this point old URLs (`/dashboard`, `/boost`, ...) still work AND new Lab URLs work. Sidebar points at new URLs

## 2. Phase 2 — Move canonical paths + add redirects

- [x] 2.1 Extended `src/proxy.ts` (Next.js 16 renamed `middleware.ts`) with `LAB_REDIRECTS` map of 22 legacy → Lab pairs. Each redirect is 307, sorted by key length so `/campaigns/new` matches before `/campaigns`. Preserves locale prefix + tenant slug + any trailing dynamic segments. `/tools` redirects to `/insights-lab` (the most common destination)
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
