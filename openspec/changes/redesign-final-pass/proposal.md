# Redesign — Final Pass

## Why

The first redesign pass (`redesign-design-system`) covered the design system + the 8 main nav pages + post-launch fixes. Three remaining gaps were identified by the user during visual review:

1. **Settings pages still use the old design pattern.** `/settings/integrations` has an inline `<h1>Settings</h1>` header; `/settings/billing` has no page header at all. Neither feeds the topbar via `SetPageTitle`. OWNER role uses these pages frequently (connect Meta, subscription, invoices) so the inconsistency is jarring.

2. **Mobile is unusable.** The sidebar uses `hidden lg:flex` — on viewports < 1024px the entire navigation disappears with no fallback. There's no hamburger menu trigger anywhere, so a mobile user has no way to navigate between pages.

3. **Creatives library is a placeholder.** The `/creatives` page renders the sidebar + topbar + an `EmptyState` but no actual functionality. Users can't upload images/videos, can't see what they've already uploaded, and the Campaign Builder can't pull from a library — it can only generate via AI per-campaign.

## What Changes

### Settings consistency

- Add `<SetPageTitle title="ตั้งค่า" subtitle="..." />` to `/settings/integrations` and `/settings/billing`.
- Remove the inline `<h1>` from integrations.
- Wrap both in the standard `mx-auto max-w-screen-2xl space-y-6 px-6 py-6` container.

### Mobile responsive shell

- Add `<MobileNavTrigger />` in `topbar-v2.tsx` shown only on `< lg`. Renders a hamburger button.
- Add `<MobileSidebar />` — a drawer that slides in from the left, contains the same nav items as the desktop sidebar, closes on route change or outside click.
- Sidebar stays `hidden lg:flex` on desktop; the drawer is the mobile counterpart.

### Creatives library

- New Prisma model `TenantCreative`: id, tenantId, kind (image/video), url, name, dimensions, sizeBytes, source (upload/ai-gen), creatorUserId, createdAt.
- New API routes:
  - `POST /api/creatives/upload` — accepts multipart form, uploads to Vercel Blob, persists `TenantCreative` row
  - `GET /api/creatives` — paginated list scoped to tenant
  - `DELETE /api/creatives/[id]` — soft-delete (sets `deletedAt`)
- Rebuild `/creatives` page: grid of thumbnails, filter by kind, search by name, upload button (opens drag-drop modal), "ใช้ใน Ad" CTA on each card.
- Extend Campaign Builder image picker to support: AI generate (current) OR pick from library (new).

## Impact

- Affected specs: `ui-design-system` (settings now uses standard pattern), new spec `creative-library`.
- Affected code:
  - `src/app/t/[tenantSlug]/settings/integrations/page.tsx`
  - `src/app/t/[tenantSlug]/settings/billing/page.tsx`
  - `src/components/tenant/topbar-v2.tsx`
  - `src/components/tenant/sidebar-v2.tsx` (extract item list for reuse in mobile drawer)
  - New: `src/components/tenant/mobile-sidebar.tsx`
  - New: `src/app/api/creatives/*` + `src/lib/creatives/*`
  - New: `prisma/schema.prisma` adds `TenantCreative`
  - `src/app/t/[tenantSlug]/creatives/page.tsx` (full rewrite)
  - `src/components/tenant/campaign-builder-form.tsx` + AI builder (creative source picker)
- Migration: add `TenantCreative` table — non-breaking, no existing data to migrate.
- Env: needs `BLOB_READ_WRITE_TOKEN` (Vercel Blob) — already set if Vercel project has Blob enabled.
