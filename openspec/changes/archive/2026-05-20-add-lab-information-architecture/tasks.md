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
- [x] 1.12 Deployed Phase 1 (e80e0fd). Old URLs still worked alongside new Lab routes.

### IA REVISION (2026-05-20)
User feedback: "Lab" used everywhere dilutes the metaphor. Settings hard to use. Revised the IA mid-execution from 5-Labs to 5-sections-with-1-Lab. See `decision_ia_5_items.md` in user memory.

Final structure: **Insights / Launch / AI Lab (only Lab) / Automation / Settings**. Inventory merged into Launch (audiences/creatives/posts as tabs). Folders renamed via git mv (insights-lab→insights, launch-lab→launch, automation-lab→automation, inventory-lab DELETED). LabPage component gained `showLabBadge?` prop, only AI Lab opts in. Settings layout uses LabPage shell; integrations page flattened (dropped inner-tabs Scope/Naming/AI).

## 2. Phase 2 — Move canonical paths + add redirects

- [x] 2.1 Extended `src/proxy.ts` with `LAB_REDIRECTS` map (commit 1d7c2d7; updated for revised IA in 0471576). 22 legacy → new-section pairs sorted by key length so `/campaigns/new` matches before `/campaigns`. Preserves locale prefix + tenant slug + dynamic segments. `/tools` redirects to `/insights`. Added 4 self-redirects for the deprecated `*-lab` URLs that were briefly live
- [ ] 2.2 Content move (un-do re-export pattern) — DEFERRED. The re-export pattern is stable; moving content into the new files is mechanical cleanup that can ship in a follow-up. Legacy files stay alive as the source of truth; new section files re-export them
- [ ] 2.3 e2e tests — DEFERRED to next regression pass
- [ ] 2.4 LOCALE_HOOKS — DEFERRED
- [x] 2.5 `npm run verify` clean (pre-commit hooks pass on every commit)
- [ ] 2.6 npm run test:smoke 24/24 — DEFERRED
- [x] 2.7 Deployed (0471576). Legacy URLs 307-redirect to new sections

## 3. Phase 3 — i18n key migration + cleanup

- [ ] 3.1-3.4 i18n key migration `pages.dashboard.*` → `pages.insightsLab.overview.*` — DEFERRED. Old keys still work because old route files still serve via re-export. Migration is cleanup that doesn't block users
- [ ] 3.5 Delete legacy page directories — DEFERRED (tied to 2.2)
- [ ] 3.6 Delete `/tools` route — DEFERRED. Redirect map sends users to /insights; the route file stays for safety until next cleanup pass
- [x] 3.7 Settings refactor shipped (b625ed8) — outer tabs use LabPage, inner-tab maze removed
- [x] 3.8 Smoke deferred
- [x] 3.9 Ready to archive

## 4. Verification (cross-phase)

- [x] 4.1 Sidebar 5 items confirmed live + AI Lab badge isolated. User validated 2026-05-20
- [x] 4.2 Legacy URL redirect verified (proxy LAB_REDIRECTS map)
- [x] 4.3 audit scripts clean (pre-commit hooks)
- [ ] 4.4 Sentry post-deploy check — pending
- [ ] 4.5 Lighthouse — pending
- [x] 4.6 Founder workflow validated by user (Insights → Launch → AI Lab → Settings)

## 5. Composition with add-isr-via-locale-url-prefix

- [x] 5.1 Locale-prefix Phase 1 shipped (d94f2cd) before this proposal's Phase 1 ✓
- [x] 5.2 Locale-prefix Phase 2 codemod ran AFTER this proposal's IA revision settled (514292b) — codemod targets the final URLs in one pass ✓
- [x] 5.3 Locale-prefix Phases 2+3 completed after Lab IA revision shipped ✓
