# Redesign Final Pass — Tasks

## 1. Settings consistency (quick win, ~30 min)
- [ ] 1.1 Refactor `src/app/t/[tenantSlug]/settings/integrations/page.tsx` — add SetPageTitle, remove inline `<h1>Settings</h1>`, standardize container
- [ ] 1.2 Refactor `src/app/t/[tenantSlug]/settings/billing/page.tsx` — wrap in standard container, add SetPageTitle "การเรียกเก็บเงิน"
- [ ] 1.3 Verify topbar shows title + subtitle on both pages

## 2. Mobile responsive shell (~4-6 hrs)
- [ ] 2.1 Extract sidebar nav items into reusable structure (export from `sidebar-v2.tsx` or move to `sidebar-nav.ts`)
- [ ] 2.2 New `src/components/tenant/mobile-sidebar.tsx` — drawer using Radix Dialog or our own portal-based slide-in
- [ ] 2.3 Add hamburger button to `topbar-v2.tsx` shown only on `< lg` (sm:hidden + lg:hidden combo)
- [ ] 2.4 Drawer auto-closes on route change (use `usePathname` effect)
- [ ] 2.5 Topbar layout: hamburger left on mobile, tenant switcher etc. on right
- [ ] 2.6 Test on iPhone-width (375) + tablet (768) viewports via playwright

## 3. Creatives library — schema + backend (~3 hrs)
- [ ] 3.1 Add `TenantCreative` model to `prisma/schema.prisma` + run migration
- [ ] 3.2 `src/lib/creatives/upload.ts` — Vercel Blob upload helper (signed URL or direct upload)
- [ ] 3.3 `src/app/api/creatives/upload/route.ts` — POST multipart, validate size/type (10MB max, jpg/png/webp/mp4)
- [ ] 3.4 `src/app/api/creatives/route.ts` — GET paginated list scoped to tenant
- [ ] 3.5 `src/app/api/creatives/[id]/route.ts` — DELETE soft-delete

## 4. Creatives library — UI (~4-5 hrs)
- [ ] 4.1 `src/components/tenant/creatives-client.tsx` — grid + filter + search + upload modal
- [ ] 4.2 Rewrite `src/app/t/[tenantSlug]/creatives/page.tsx` to load + pass to client
- [ ] 4.3 Update KPI cards on creatives page with real counts
- [ ] 4.4 Drag-drop upload modal with progress + multiple file support

## 5. Campaign Builder integration (~2 hrs)
- [ ] 5.1 Add "เลือกจากคลัง" toggle in Campaign Builder image step
- [ ] 5.2 New `<LibraryPicker />` component reusing creatives API
- [ ] 5.3 When using library image, persist `creativeId` reference (not URL)

## 6. Specs
- [ ] 6.1 Update `openspec/specs/ui-design-system/spec.md` — add mobile responsive requirements
- [ ] 6.2 New `openspec/specs/creative-library/spec.md` — new capability

## 7. Verify
- [ ] 7.1 Type-check passes
- [ ] 7.2 E2E on prod: visit settings pages — title in topbar ✓
- [ ] 7.3 E2E on prod: mobile viewport — hamburger menu opens + closes + navigates
- [ ] 7.4 E2E on prod: upload an image + see it appear + use it in Campaign Builder

## 8. Ship
- [ ] 8.1 Commit + push (per logical group: settings, mobile, creatives)
- [ ] 8.2 Archive change via openspec-archive-change skill
