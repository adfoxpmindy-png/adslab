## Context

Existing AdsLab features (Insights dashboard, AI Daily Report, KPI Tracker) are gated behind login + tenant membership. Operators currently have no native way to share a snapshot of an ad account's performance with a client who does not have an AdsLab login. The two stopgaps they use today (manual screenshots; password sharing) are both broken — screenshots go stale instantly, password sharing exposes 31 other ad accounts in the same BM.

Survey of the codebase before designing (see Explore agent output in conversation):
- `src/lib/meta/dashboard-service.ts` already has a DB-cached `getDashboardData(tenantId, range)` that returns parsed insights with spend / impressions / clicks / CTR / CPM / CPC / ROAS / conversions per account and per campaign. This is the right primitive to feed the viewer page — no new Meta API calls for KPI data.
- `src/lib/meta/insights.ts` `fetchInsightsForAllAccounts(accessToken, range)` is the underlying fetcher; `MetaInsightCache` table holds the cache (TTL `INSIGHTS_CACHE_TTL_SEC` default 900s).
- `src/lib/auth/tenant.ts` `requireTenantMember(slug, allowedRoles?)` is the role-gating pattern used elsewhere; we follow it for write operations on viewer links.
- `src/app/api/meta/pixels/[pixelId]/share/route.ts` is the closest existing pattern (Zod + session + role-gate + Meta API call).
- No existing share-token / public-link feature exists. `EmailVerificationToken` is the closest pattern but is single-use; ours is multi-view with manual revoke.
- Creative previews (image / video / carousel thumbnail) are NOT fetched today. `MetaAd.creativeId` is stored but no field caches the actual asset URL. This is a real gap to close — viewer page needs thumbnails or it looks broken.

## Goals / Non-Goals

**Goals:**
- Operator can generate a public URL for an ad account or a single campaign in ≤3 clicks (Insights/Launch page → Share button → Copy)
- Recipient sees a clean read-only page that renders within ~1s using the existing 15-minute KPI cache
- Recipient sees the actual ad creative (image / video thumbnail / carousel first frame), not just text
- Operator can revoke any link in one click; revocation propagates immediately (next page load → 410 / 404)
- No new Meta API calls per page load — both KPI data and creative previews are DB-cached
- All operator-visible UI is i18n-ready in en / th / lo
- Ships in 6 commits, each independently browser-verifiable

**Non-Goals:**
- Auto-expiring links (user explicitly chose manual revoke only)
- White-label / custom branding (footer is always "Powered by AdsLab")
- PDF export, scheduled email reports, comparison views, custom date ranges beyond 7d / 14d / 30d — all deferred to v2
- Per-ad-level sharing (only ACCOUNT and CAMPAIGN scope ship in this change)
- Recipient analytics beyond `viewCount` and `lastViewedAt` (no per-session, no geo, no UA breakdown)
- Notification when client opens link (deferred)

## Decisions

### D1. Token format: cryptographically random base64url, 22 chars (~128 bits)

We use `crypto.randomBytes(16)` → `base64url` → trim padding. Result is 22 URL-safe chars, fits in a LINE message comfortably, has 128 bits of entropy (un-guessable in any realistic attack window).

Alternatives considered:
- UUID v4 → 36 chars with dashes, looks like an internal ID, slightly less entropy after dashes.
- Short slugs (8-10 chars) like Bit.ly → too brute-forceable for a public surface that exposes spend data.
- Signed JWT → unnecessary; we control both sides and need server-side revocation, which JWTs are bad at.

### D2. Revocation = soft delete (`isActive = false`), never hard delete

Soft delete preserves `viewCount` + `lastViewedAt` for operator audit ("who I shared with, how many times they looked"). Hard delete loses that. Cost is one extra row per revoked link — negligible.

### D3. Creative previews: new `MetaAdCreativePreview` table, NOT a column on `MetaAd`

Reasons:
- A single Meta creative can be reused across many ads; storing per-ad duplicates data.
- Preview fields (image URL, video thumbnail URL, type) can be NULL during fetch — keeping them on `MetaAd` complicates the existing model.
- TTL behavior differs: insights cache 15 min, but creative preview URLs from Meta are stable for days/weeks — different cache lifecycle.

Schema:
```
MetaAdCreativePreview {
  id            String @id @default(cuid())
  creativeId    String @unique   // Meta creative ID
  type          String           // "IMAGE" | "VIDEO" | "CAROUSEL"
  imageUrl      String?
  videoThumbUrl String?
  fetchedAt     DateTime
  expiresAt     DateTime         // 7 days default
}
```

Fetch logic: on viewer page load, for each active ad, look up `MetaAdCreativePreview` by `creativeId`; if missing or expired, fetch from Meta via `getFreshAccessToken()` for the link's tenant, write back.

### D4. Viewer page reuses `getDashboardData(tenantId, range)` directly

The function is already DB-cached, tenant-scoped, and battle-tested. The viewer route just resolves token → tenantId → calls it, then filters the result down to the link's scope (single account or single campaign).

This means: a viewer page hit during the 15-min cache window costs zero Meta API calls. After the window, the first viewer hit re-warms the cache for the operator too. Symbiotic.

### D5. URL pattern: `/v/[token]` (no locale prefix)

The viewer is for clients who don't speak the operator's language necessarily. We sniff `Accept-Language` and default to English if absent. Operator can append `?lang=th` to override. Putting the token at the shortest possible path (`/v/`) means it fits in LINE/SMS messages cleanly.

Alternatives:
- `/[locale]/v/[token]` — adds a locale segment that clients won't understand; if the operator copies `https://adslab.app/th/v/abc`, an English-speaking client sees a Thai page first.
- `/viewer/[token]` — more descriptive but longer; the `/v/` convention is well-established (YouTube, Vercel, Cal.com).

### D6. "Share with Client" button placement

- **Insights page** (account-level): Top-right of header, next to date range selector. Generates ACCOUNT-scoped link.
- **Launch page** (campaign-level): A "Share" icon button in each campaign row. Generates CAMPAIGN-scoped link for that specific campaign.
- **Link Management UI**: New page under `/[locale]/t/[tenantSlug]/settings/share-links` (or similar) — list, revoke, copy.

### D7. Auth model for write operations

`POST` and `DELETE` on `/api/viewer-links` require `requireTenantMember(slug, ["OWNER", "MEDIA_BUYER"])` — same roles allowed to share pixels. Read-only members cannot generate or revoke share links.

### D8. Rate limiting on public viewer route

Cap per-token request rate at 60/min via in-memory token bucket (no Redis dependency yet). Above cap → 429 with `Retry-After`. Prevents a misconfigured client (or scraper that found a leaked link) from hammering the cache.

## Risks / Trade-offs

- **[Risk] Leaked link → all account spend data exposed publicly** → Mitigation: 128-bit token entropy + operator can revoke instantly + soft-deleted links return 404 not 410 (no information leak about whether the link ever existed). Document in operator-facing UI that anyone with the link can view ("treat like a password").

- **[Risk] Meta API rate limit on creative preview fetch** → Mitigation: `MetaAdCreativePreview` 7-day TTL + only fetch on viewer page load (not eagerly for every ad in the tenant) + Phase 3 ships separately so we can monitor before adding load.

- **[Risk] Creative URLs from Meta are CDN-signed and may expire before our TTL** → Mitigation: on first 4xx from Meta CDN, refetch the preview from Graph API and update the cache. Add a `lastErrorAt` field if needed in v2.

- **[Risk] Cache desync — operator deletes a campaign but the viewer link still references its `targetId`** → Mitigation: viewer route checks the campaign still exists in `MetaCampaign` table; if missing → render "Campaign no longer exists" + flag link as orphaned in management UI. Do NOT auto-delete the link (operator might want to know).

- **[Trade-off] No notification when client opens the link** — operators might want a "client viewed your report" ping. Deferred to v2; `viewCount` + `lastViewedAt` are enough for MVP audit.

- **[Trade-off] Locale sniffing instead of explicit locale in URL** — slight UX win (cleaner URL) at the cost of edge case where the same token shows different language to different clients. Acceptable.

- **[Risk] Operator opens link to test → `viewCount` inflates → false signal "client looked 5 times"** → Mitigation: ship as-is in MVP; add cookie-based "exclude operator opens" in v2 if it becomes a real complaint.

## Migration Plan

Single Prisma migration adds two tables (`ViewerLink`, `MetaAdCreativePreview`) and one index. No data backfill required. Rollback = `prisma migrate resolve --rolled-back` + revert the schema. No downtime.

Per `feedback_incremental_deploy_verify`, ship in 6 commits with browser verification between each (see tasks.md for the breakdown). If any commit breaks production, revert that single commit — the schema migration in commit 1 stands on its own and does not require subsequent commits to be valid.

## Open Questions

- None blocking. Default date range = 7d (industry standard for ad reports). If founder wants 30d default after dogfooding, change the default in `ViewerLink.dateRange` and run a one-line update on existing rows.
