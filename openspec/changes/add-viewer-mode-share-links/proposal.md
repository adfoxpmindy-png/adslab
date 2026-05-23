## Why

Agency operators need to show clients ad performance without giving them full app access — currently the only options are screenshots (manual, doesn't auto-update) or sharing login credentials (insecure, exposes 31 BM accounts). A public read-only "viewer link" is the standard agency reporting pattern and unlocks AdsLab as a tool the operator can resell to non-technical clients.

This also doubles as a marketing surface — every shared link carries "Powered by AdsLab" in the footer, putting the brand in front of every client the operator works with.

## What Changes

- New `ViewerLink` Prisma model with `token`, `tenantId`, `scope` (ACCOUNT | CAMPAIGN), `targetId`, `dateRange`, `isActive`, `createdById`, `viewCount`, `lastViewedAt`
- New `MetaAdCreativePreview` Prisma model — DB cache for ad creative image/video URLs so the public route does not hammer the Meta Graph API on every view
- New API routes:
  - `POST /api/viewer-links` — create a link (OWNER + MEDIA_BUYER only)
  - `GET /api/viewer-links?tenantSlug=X` — list links for a tenant
  - `DELETE /api/viewer-links/[id]` — revoke a link (sets `isActive=false`, no hard delete so audit + viewCount survive)
- New public route `/[locale]/v/[token]/page.tsx` — no auth required, validates token + `isActive`, increments `viewCount` and `lastViewedAt`
- New "Share with Client" button + modal on the Insights page (account scope) and Launch page (campaign scope) — generates link and copies to clipboard
- New tenant-scoped Link Management UI page — list active and revoked links, revoke action, view stats
- New i18n namespace `viewer.*` in `messages/en.json`, `messages/th.json`, `messages/lo.json`

Ship in 6 incremental commits with browser verification between each (per `feedback_incremental_deploy_verify` memory): Foundation+API → Public viewer (no preview) → Creative previews → Share button+modal → Campaign scope → Link management UI.

## Capabilities

### New Capabilities
- `viewer-mode-share-links`: Public token-protected read-only views of ad account and campaign performance, shareable as a URL with no auth required by the recipient.

### Modified Capabilities
<!-- None — this is a net-new capability that does not change spec-level behavior of any existing capability. -->

## Impact

- **Database:** New `ViewerLink` and `MetaAdCreativePreview` tables; one Prisma migration. No changes to existing tables.
- **Routes:** 3 new internal API routes under `/api/viewer-links/*`; 1 new public route under `/[locale]/v/[token]`; 1 new internal management page.
- **Existing code reused:** `getDashboardData()` from `src/lib/meta/dashboard-service.ts` (already DB-cached via `MetaInsightCache`); `getFreshAccessToken()` from `src/lib/meta/client.ts`; auth helpers `requireSession()` and `requireTenantMember()`.
- **Meta API surface:** New call to `ad_creative` endpoint for preview image/video URL, results cached in `MetaAdCreativePreview` (TTL ≥ 24h to stay well under Meta rate limits).
- **Security:** Public route is the only no-auth surface added — token must be cryptographically random (≥128 bits of entropy), validated server-side, and revocation must propagate immediately. No PII (audience names, internal naming detail beyond what the operator named the ad) is exposed beyond what is already visible on the ad itself in Ads Manager.
- **i18n:** Three locale files get a new `viewer.*` namespace.
- **Cost:** Negligible — viewer page reads from existing cache; creative preview cache is one-time fetch per ad creative.
