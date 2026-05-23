## ADDED Requirements

### Requirement: Operator generates a shareable viewer link

The system SHALL allow a tenant member with role OWNER or MEDIA_BUYER to generate a viewer link scoped either to a single connected ad account (ACCOUNT scope) or to a single campaign within a connected ad account (CAMPAIGN scope).

Each link MUST contain a cryptographically random token of at least 128 bits of entropy, encoded as URL-safe base64 (22 characters), unique across the system.

The link MUST be returned together with its full shareable URL in the form `https://<host>/v/<token>`.

The link MUST be persisted with: `token`, `tenantId`, `scope`, `targetId` (Meta account ID for ACCOUNT scope, Meta campaign ID for CAMPAIGN scope), `dateRange` (one of `"7d"`, `"14d"`, `"30d"`; default `"7d"`), `isActive=true`, `createdById`, `createdAt`, `viewCount=0`, `lastViewedAt=null`.

#### Scenario: Owner creates an account-scoped link
- **WHEN** an OWNER calls `POST /api/viewer-links` with `{tenantSlug, scope: "ACCOUNT", targetId: "<metaAccountId>"}`
- **THEN** the system responds 201 with `{ok: true, token, url}` and persists the new `ViewerLink` row

#### Scenario: Media buyer creates a campaign-scoped link with 30d range
- **WHEN** a MEDIA_BUYER calls `POST /api/viewer-links` with `{tenantSlug, scope: "CAMPAIGN", targetId: "<metaCampaignId>", dateRange: "30d"}`
- **THEN** the system responds 201 with `{ok: true, token, url}` and the persisted row carries `dateRange = "30d"`

#### Scenario: Read-only member cannot create a link
- **WHEN** a member with role READ_ONLY calls `POST /api/viewer-links`
- **THEN** the system responds 403 and does NOT persist any row

#### Scenario: Invalid scope is rejected
- **WHEN** a caller submits `scope: "AD"` (not supported in this capability)
- **THEN** the system responds 400 with a Zod validation error

### Requirement: Operator lists viewer links for a tenant

The system SHALL allow a tenant member (any role) to list all viewer links (both active and revoked) created for tenants they belong to, ordered by `createdAt` descending.

Each listed link MUST include `id`, `token`, `scope`, `targetId`, `dateRange`, `isActive`, `viewCount`, `lastViewedAt`, `createdAt`, and the display name of the creator.

The full shareable URL SHALL be reconstructable from the `token` by the client.

#### Scenario: Member lists their tenant's links
- **WHEN** a member calls `GET /api/viewer-links?tenantSlug=<slug>`
- **THEN** the system responds 200 with `{ok: true, links: [...]}` containing all links for that tenant

#### Scenario: Member cannot list another tenant's links
- **WHEN** a member calls `GET /api/viewer-links?tenantSlug=<other-tenant>`
- **THEN** the system responds 403

### Requirement: Operator revokes a viewer link

The system SHALL allow a tenant member with role OWNER or MEDIA_BUYER to revoke any viewer link belonging to their tenant. Revocation MUST be a soft delete: the row stays, `isActive` is set to `false`, and historical `viewCount` and `lastViewedAt` are preserved for audit.

After revocation, the public route MUST treat the link as if it does not exist (404), without disclosing that it was previously valid.

#### Scenario: Owner revokes a link
- **WHEN** an OWNER calls `DELETE /api/viewer-links/<id>`
- **THEN** the system responds 200 with `{ok: true}` and sets `isActive=false` on the row

#### Scenario: Revoked link returns 404 on public route
- **WHEN** a recipient opens `/v/<token>` after the link was revoked
- **THEN** the system responds 404 with the standard "page not found" view (no hint that this link previously existed)

#### Scenario: Read-only member cannot revoke a link
- **WHEN** a READ_ONLY member calls `DELETE /api/viewer-links/<id>`
- **THEN** the system responds 403 and does NOT modify the row

### Requirement: Recipient views shared performance via public URL

The system SHALL serve `/v/[token]` as a public route requiring NO authentication, NO cookie, and NO referrer header. The route MUST validate the token against the `ViewerLink` table and render the corresponding read-only performance view if and only if `isActive=true`.

The route MUST increment `viewCount` and set `lastViewedAt` to the current timestamp on every successful render.

The view MUST contain:
- Header with the tenant or campaign display name and the date range
- Four KPI cards: total Spend, total Purchase count, ROAS, and count of Active Ads
- A grid of all currently-active ads in the scope, each rendered with creative preview thumbnail, ad name, Spend, CTR, CPA, and ROAS
- A footer reading "Powered by AdsLab" linking to the AdsLab marketing site

The view MUST NOT expose any action that mutates data (no pause, no edit, no comment, no chat).

#### Scenario: Recipient opens a valid active account-scoped link
- **WHEN** a recipient navigates to `/v/<token>` and the linked ViewerLink is active with scope ACCOUNT
- **THEN** the system responds 200 with the read-only performance view for that ad account and increments `viewCount` by 1

#### Scenario: Recipient opens an unknown token
- **WHEN** a recipient navigates to `/v/<token>` and no matching `ViewerLink` exists
- **THEN** the system responds 404 (standard not-found page, no hint about the system's link table)

#### Scenario: Recipient opens a link whose underlying campaign was deleted
- **WHEN** a recipient navigates to `/v/<token>`, the link is active and scope CAMPAIGN, but the target campaign no longer exists in `MetaCampaign`
- **THEN** the system responds 200 with a "Campaign no longer available" view and the link is flagged as orphaned in the management UI

### Requirement: Viewer page renders ad creative previews

The system SHALL render a creative preview thumbnail (image or first frame of video / carousel) for every ad shown in the viewer page. Preview URLs MUST be persisted in a DB-backed `MetaAdCreativePreview` cache keyed by Meta creative ID with a TTL of at least 24 hours.

When a preview is missing or expired in the cache, the viewer route MUST fetch the preview from the Meta Graph API using the tenant's access token (via `getFreshAccessToken()`), write it back to the cache, and render it. On Meta API failure, the viewer MUST fall back to a placeholder image and continue rendering all other ads.

#### Scenario: Cached creative preview is reused
- **WHEN** the viewer page renders an ad whose `creativeId` is present and not expired in `MetaAdCreativePreview`
- **THEN** the system reads the URL from the cache and makes NO Meta API call

#### Scenario: Missing creative preview is fetched and cached
- **WHEN** the viewer page renders an ad whose `creativeId` is absent from `MetaAdCreativePreview`
- **THEN** the system calls the Meta Graph API once for that creative, persists the result, and renders the preview

#### Scenario: Meta API failure during preview fetch
- **WHEN** the Meta API returns a 4xx or 5xx for a specific creative
- **THEN** the viewer renders a placeholder for that ad and continues to render all other ads normally

### Requirement: Viewer route is rate-limited per token

The system SHALL enforce a per-token request rate of at most 60 requests per minute on the public viewer route. Requests above the cap MUST receive a 429 response with a `Retry-After` header.

#### Scenario: Burst above cap is throttled
- **WHEN** a single token receives more than 60 GET requests within 60 seconds
- **THEN** subsequent requests for that token receive 429 with `Retry-After: 60` until the window resets

### Requirement: Viewer route respects recipient locale preference

The system SHALL render the viewer page in English, Thai, or Lao based on the recipient's `Accept-Language` header, defaulting to English when no supported locale is present. An explicit `?lang=` query parameter (value: `en`, `th`, or `lo`) MUST override the header.

All operator-visible operator-creation UI (Share modal, management page) MUST be available in all three locales under a new i18n namespace `viewer`.

#### Scenario: Thai recipient sees Thai labels
- **WHEN** a recipient with `Accept-Language: th-TH,th;q=0.9` opens a viewer link
- **THEN** the system renders the page in Thai

#### Scenario: Explicit lang param overrides header
- **WHEN** a recipient with `Accept-Language: en-US` opens `/v/<token>?lang=th`
- **THEN** the system renders the page in Thai

#### Scenario: Unknown locale falls back to English
- **WHEN** a recipient with `Accept-Language: ja-JP` opens a viewer link with no `?lang=` parameter
- **THEN** the system renders the page in English

### Requirement: KPI data is sourced from the existing insights cache

The system SHALL source spend, impressions, clicks, CTR, CPM, CPC, ROAS, conversion count, and per-campaign metrics for the viewer page from the existing `getDashboardData(tenantId, range)` helper backed by `MetaInsightCache`. The viewer route MUST NOT make direct Meta Graph API calls for KPI data.

#### Scenario: Viewer page hits during cache window cost zero Meta API calls
- **WHEN** the viewer page is opened while `MetaInsightCache` for the tenant + range is fresh
- **THEN** the system returns cached data and makes NO Meta API call

#### Scenario: First viewer hit after cache expiry re-warms the cache
- **WHEN** the viewer page is opened after `MetaInsightCache` has expired
- **THEN** the system fetches fresh insights, writes them to the cache, and the next operator dashboard request reads the same cache
