## 1. Commit 1 — Foundation (schema + API, no UI)

- [x] 1.1 Add `ViewerLink` model to `prisma/schema.prisma` per design D1/D2 (token unique, scope String, targetId String, dateRange default `"7d"`, isActive default true, viewCount default 0, createdById FK, lastViewedAt nullable, indexes on tenantId and token)
- [x] 1.2 Add `MetaAdCreativePreview` model to `prisma/schema.prisma` per design D3 (creativeId unique, type String, imageUrl + videoThumbUrl nullable, fetchedAt + expiresAt DateTime)
- [x] 1.3 Add reverse relations on `Tenant` and `User` for `ViewerLink`
- [x] 1.4 Run `npx prisma migrate dev --name add_viewer_links` and verify migration SQL is clean (no destructive ops, no rename surprises)
- [x] 1.5 Create `src/lib/viewer-link.ts` with `generateViewerToken()` (crypto.randomBytes(16) → base64url, trim padding) and `getViewerLinkByToken(token)` helper that returns `{ link, tenant } | null` and gates on `isActive=true`
- [x] 1.6 Create `src/app/api/viewer-links/route.ts` with POST handler — Zod validate `{tenantSlug, scope: enum, targetId, dateRange?}`, gate via `requireTenantMember(slug, ["OWNER", "MEDIA_BUYER"])`, create row, return `{ok, token, url}` (use `NEXT_PUBLIC_APP_URL` + `/v/<token>`)
- [x] 1.7 Add GET handler to `src/app/api/viewer-links/route.ts` — Zod validate `?tenantSlug=`, gate via `requireTenantMember(slug)` (any role), return ordered list with creator display name joined
- [x] 1.8 Create `src/app/api/viewer-links/[id]/route.ts` with DELETE handler — gate via `requireTenantMember(slug, ["OWNER", "MEDIA_BUYER"])`, verify link belongs to caller's tenant, set `isActive=false`, return `{ok}`
- [x] 1.9 Curl-test all 3 endpoints against local dev: create → list → revoke → list (expect isActive=false). Document the curl commands in PR description.
- [x] 1.10 Run `npm run verify` (typecheck + build + audit scripts) and commit as Commit 1. Browser verification: confirm app still loads at `/` (no UI changed)

## 2. Commit 2 — Public viewer page (account scope, KPI only, no creative previews)

- [x] 2.1 Create `src/app/v/[token]/page.tsx` — Server component, no auth, fetch via `getViewerLinkByToken`, return `notFound()` if null or inactive
- [x] 2.2 Increment `viewCount` and set `lastViewedAt` in the same DB call as the lookup (single transaction or upsert pattern)
- [x] 2.3 Resolve locale: read `Accept-Language` header server-side, support override via `?lang=` searchParam, fall back to `en`. Pass locale to `getTranslations` for the viewer namespace.
- [x] 2.4 For ACCOUNT scope: call `getDashboardData(tenantId, range)` and filter to the link's `targetId` (one account). For CAMPAIGN scope: return 200 with "scope not yet supported" placeholder — full support ships in Commit 5.
- [x] 2.5 Render header (tenant or account name + date range) and 4 KPI cards (Spend, Purchase, ROAS, Active Campaigns count). Use existing Card + KPI components from `src/components/ui-system/*` if available; otherwise inline styled per DESIGN.md.
- [x] 2.6 Render campaign grid: for each active campaign, show campaign name + per-campaign KPIs (Spend, CTR, CPA, ROAS) in a placeholder Card. No creative thumbnail yet — leave a 16:9 gray placeholder box. (Per-ad rendering deferred to v2 once ad-level insights are cached.)
- [x] 2.7 Render footer: "Powered by AdsLab" linking to marketing site.
- [x] 2.8 Add i18n keys to `messages/en.json`, `messages/th.json`, `messages/lo.json` under `viewer.*` namespace (header labels, KPI labels, footer text, empty state, error states)
- [x] 2.9 Test edge cases by hand: unknown token (expect 404), revoked link (expect 404), link with CAMPAIGN scope (expect placeholder), link to deleted account (expect graceful "no data" state).
- [x] 2.10 Run `npm run verify` and commit as Commit 2. Browser verification: create a real ACCOUNT-scoped link via curl using the founder's FROST account, open in private window, screenshot for PR.

## 3. Commit 3 — Creative previews

- [ ] 3.1 Add `src/lib/meta/creative-preview.ts` with `getCreativePreview(creativeId, tenantId)` that reads from `MetaAdCreativePreview` cache (skip if expiresAt > now()), else fetches `?fields=id,image_url,object_type,object_story_spec,asset_feed_spec,thumbnail_url` from `/v22.0/<creativeId>` using `getFreshAccessToken(tenantId)`, normalizes the response to `{type, imageUrl, videoThumbUrl}`, writes to cache with 7-day TTL.
- [ ] 3.2 Handle failure path: 4xx/5xx from Meta → return `null`, do NOT cache (so we retry next time). Log to existing logger.
- [ ] 3.3 Update viewer page (`src/app/v/[token]/page.tsx`) to call `getCreativePreview` for each active ad in parallel (use `Promise.allSettled` so one bad creative doesn't block the page).
- [ ] 3.4 Replace gray placeholder in ad grid with actual `<img>` (image type) or `<video>` poster (video type, no autoplay) — handle null fallback with a "no preview" placeholder.
- [ ] 3.5 Add image domain to `next.config.ts` `images.remotePatterns` if the Meta CDN host (`scontent-*.fbcdn.net`, `video.f*.fbcdn.net`) is not already whitelisted.
- [ ] 3.6 Run `npm run verify` and commit as Commit 3. Browser verification: re-open the same viewer link, confirm thumbnails render for image, video, and carousel ads; check Network tab to confirm Meta is called only once per creative (subsequent reloads hit cache).

## 4. Commit 4 — "Share with Client" button + modal on Insights page (ACCOUNT scope only)

- [ ] 4.1 Create `src/components/viewer/share-link-button.tsx` ("use client") — button + dialog using existing shadcn Dialog from `src/components/ui/*`. Props: `tenantSlug`, `scope: "ACCOUNT" | "CAMPAIGN"`, `targetId`, `defaultDateRange`.
- [ ] 4.2 Modal body: show scope summary, dateRange dropdown (7d/14d/30d), Generate button. On submit → `POST /api/viewer-links` → display generated URL with Copy button → toast on copy.
- [ ] 4.3 Wire button into the Insights page header (`src/app/[locale]/t/[tenantSlug]/insights/...` — find the right server-component-friendly insertion point per the survey). Pass `scope="ACCOUNT"` and the current selected account ID.
- [ ] 4.4 Add i18n keys for button label, modal labels, copy button, toast success/error.
- [ ] 4.5 Run `npm run verify` and commit as Commit 4. Browser verification: open Insights, click Share, generate a link with 30d range, copy, paste in private window, confirm renders correctly.

## 5. Commit 5 — Campaign scope (extend viewer page + add Share button to Launch page)

- [ ] 5.1 Update viewer page to handle CAMPAIGN scope: fetch the single campaign's data (filter `getDashboardData` result down to one campaign + its ads), render the same KPI + grid layout with campaign name in header instead of account name.
- [ ] 5.2 Add orphan handling: if `targetId` campaign no longer exists, render "Campaign no longer available" view (per spec scenario).
- [ ] 5.3 Wire `ShareLinkButton` into the Launch page campaign row (`src/app/[locale]/t/[tenantSlug]/launch/...`) — Share icon button per row, opens modal with `scope="CAMPAIGN"` pre-filled.
- [ ] 5.4 Update Zod schema in POST `/api/viewer-links` to validate `targetId` belongs to the tenant for both scopes (account ID → check `MetaAdAccount`, campaign ID → check `MetaCampaign`).
- [ ] 5.5 Run `npm run verify` and commit as Commit 5. Browser verification: generate CAMPAIGN-scoped link from Launch page, open in private window, confirm only that campaign's ads render.

## 6. Commit 6 — Link Management UI + rate limiting

- [ ] 6.1 Create `src/app/[locale]/t/[tenantSlug]/settings/share-links/page.tsx` — server component, fetch all `ViewerLink` rows for tenant ordered desc, render table (creator / scope / target / dateRange / viewCount / lastViewedAt / status / actions).
- [ ] 6.2 Create a "Revoke" client component button that calls `DELETE /api/viewer-links/[id]` with confirmation dialog. Use optimistic UI: row strikes through immediately, reverts on error.
- [ ] 6.3 Add "Copy URL" action on each active row (re-uses same toast pattern from share button).
- [ ] 6.4 Link the new settings page from the Settings sidebar (per existing settings IA — find the appropriate nav config).
- [ ] 6.5 Add per-token rate limiting in viewer page (or as middleware) — in-memory token bucket, 60 req/min cap, 429 + `Retry-After: 60` on overflow. Use a simple `Map<string, {count, resetAt}>` cleared via lazy expiry.
- [ ] 6.6 Add i18n keys for management page (table headers, revoke confirmation, empty state).
- [ ] 6.7 Run `npm run verify` and commit as Commit 6. Browser verification: open Settings → Share Links, see all generated links, revoke one, open revoked link in private window (expect 404), then send 70 quick reqs to an active link via curl loop (expect 429 after 60).

## 7. Wrap-up

- [ ] 7.1 Update root `README.md` (or relevant docs) with a 1-paragraph mention of viewer mode + screenshot of a generated link.
- [ ] 7.2 Run full `npm run verify` one more time on the final commit.
- [ ] 7.3 Manually test the founder's real workflow: from FROST account → generate link → send to a test client device → confirm rendering, KPIs accurate vs. operator's Insights view, creative previews load.
- [ ] 7.4 Open PR with screenshots from each browser verification step, link to this OpenSpec change, request review.
- [ ] 7.5 After merge, run `/opsx:archive` to move this change into `openspec/archived/`.
