# Redesign Final Pass — Tasks

## 1. Settings consistency (quick win, ~30 min)
- [x] 1.1 Refactor `src/app/t/[tenantSlug]/settings/integrations/page.tsx` — added SetPageTitle, removed inline `<h1>Settings</h1>`, standardized container
- [x] 1.2 Refactor `src/app/t/[tenantSlug]/settings/billing/page.tsx` — wrapped in standard container, added SetPageTitle "การเรียกเก็บเงิน"
- [x] 1.3 Verified topbar shows title + subtitle on both pages

## 2. Mobile responsive shell (~4-6 hrs)
- [x] 2.1 Extracted sidebar nav items into `sidebar-nav-items.ts`
- [x] 2.2 New `mobile-sidebar.tsx` — drawer with backdrop + Escape close + body-scroll-lock + route-change auto-close
- [x] 2.3 Added hamburger trigger via new `mobile-nav.tsx` shown only on `< lg`
- [x] 2.4 Drawer auto-closes on route change (useEffect on pathname)
- [x] 2.5 Topbar layout: hamburger left on mobile, switcher/theme/bell on right
- [x] 2.6 Tested on iPhone X-width (375) via playwright — drawer slides in with all 8 items + gradient active state

## 3. Creatives library — schema + backend (~3 hrs)
- [x] 3.1 Added `TenantCreative` model + ran `prisma db push` (no migration needed since net-new table)
- [x] 3.2 `src/lib/creatives/service.ts` — Vercel Blob put/del helpers + Prisma ops
- [x] 3.3 `POST /api/creatives/upload` — multipart, 10MB max, OWNER+MEDIA_BUYER
- [x] 3.4 `GET /api/creatives` — paginated list
- [x] 3.5 `DELETE /api/creatives/[id]` — soft-delete + best-effort blob removal

## 4. Creatives library — UI (~4-5 hrs)
- [x] 4.1 `src/components/tenant/creatives-client.tsx` — grid + filter (all/image/video) + search + upload modal
- [x] 4.2 Rewrote `/creatives` page to load real data + render KPI cards with actual counts
- [x] 4.3 Drag-drop upload modal with per-file progress (multi-file support)

## 5. Campaign Builder integration (~2 hrs)
- [x] 5.1 Added "🖼️ เลือกจากคลัง" 3rd creative source pill in Campaign Builder
- [x] 5.2 New `<LibraryPicker />` — image grid + click-to-prepare flow
- [x] 5.3 `POST /api/creatives/[id]/meta-hash` — converts library item to Meta `image_hash`, caches result on `TenantCreative.metaImageHash` so next pick is free

## 6. Specs
- [ ] 6.1 Update `openspec/specs/ui-design-system/spec.md` — add mobile responsive requirements
- [ ] 6.2 New `openspec/specs/creative-library/spec.md` — new capability

## 7. Verify
- [x] 7.1 Type-check passes (tsc --noEmit, no errors)
- [x] 7.2 E2E on prod: settings pages — title in topbar ✓
- [x] 7.3 E2E on prod: mobile viewport (375x812) — hamburger opens drawer, drawer renders all 8 nav items, gradient active state intact
- [x] 7.4 E2E on prod: /creatives page loads, KPI cards render, upload modal opens, Campaign Builder shows "เลือกจากคลัง" toggle, picker modal opens

## 8. Ship
- [x] 8.1 Commits:
  - `a36adfc` Settings consistency + mobile responsive sidebar
  - `fe063e9` Creatives library: schema + API + UI + Campaign Builder integration
- [ ] 8.2 Archive change via openspec-archive-change skill

## 9. Operational follow-up (required for upload to actually work)
- [ ] 9.1 User must enable Vercel Blob on the project: Vercel dashboard → Storage → Create → Blob → connect to `adslab` project. This auto-injects `BLOB_READ_WRITE_TOKEN`. Without it, the upload API will fail with "Vercel token not found" or similar.
- [ ] 9.2 Once token is set, redeploy (any commit triggers it) and the upload + Campaign Builder library picker will fully work end-to-end.
