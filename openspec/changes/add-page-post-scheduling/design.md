## Context

AdsLab is registered as a Marketing-API Meta app, which Meta does not allow to add the "Manage everything on your Page" use case to. The constraint is documented in [reference_meta_app_type_constraint.md](memory/reference_meta_app_type_constraint.md). On 2026-05-16 the founder side-stepped this by creating a separate "AdsLab Page" Meta app (App ID `2010104606257244`) with `pages_manage_posts` + `pages_manage_engagement` scopes. A one-off Node script (`scripts/schedule-fana-posts.ts`) used that app's tokens to schedule FANA's 6 launch posts successfully.

The proof-of-concept worked. Customers can't run that script. This change wires the same capability into the product so any tenant can compose, schedule, and publish organic page posts from inside AdsLab.

Constraints:
- **Two Meta apps**: existing AdsLab marketing app for ads + new AdsLab Page app for page management. Each has its own OAuth flow, redirect URI, scope set, and stored token. Code must keep them strictly separated; mixing the tokens causes obscure permission errors.
- **No new external services**: media uploads land in the existing Vercel Blob (already used for creatives).
- **No cron needed**: Meta's `scheduled_publish_time` parameter handles publishing natively (10 min to 6 months ahead).

## Goals / Non-Goals

**Goals:**
- One-click "Connect Page Management" auth flow that runs ALONGSIDE the existing ads connection.
- Customers can list, compose, schedule, and cancel scheduled posts on any page they admin via BM.
- Single-source-of-truth `PagePost` table tracks intent + Meta state.
- AI in chat can call `schedulePagePost` as a mutate tool — confirmation card before publishing.
- Reuse the existing media-upload infrastructure (Vercel Blob, image-processing pipeline).

**Non-Goals:**
- Editing/regenerating already-published posts.
- Cross-posting to Instagram (FB only this round).
- Reply automation / DM handling.
- A/B testing organic variants.
- Auto-composition from AI (the AI can call the tool, but copy comes from the user — copywriting auto-gen is a separate ML task).

## Decisions

### D1: Separate Meta app, separate connection table
**Choice:** Add `MetaPageConnection` distinct from `MetaConnection`. Each has its own `tenantId`, `accessTokenEncrypted`, `tokenExpiresAt`, `status`. Page tokens go through the new connection only.

**Why over alternatives:**
- One unified connection means handling two different App IDs / Secrets / Config IDs in one OAuth handler, branching everywhere. Brittle.
- Two connection types keeps the wiring clean. The ads code path imports `MetaConnection` and never touches the page path; page-post code imports `MetaPageConnection` exclusively.
- Tenants can connect them independently (some only want ads, some only want page management, some want both).

**Trade-off:** Slight code duplication in the OAuth handlers. Acceptable — diverging concerns shouldn't share code just to "DRY" them.

### D2: Store scheduled posts in our DB before AND after Meta accepts them
**Choice:** `PagePost` row created with `status: PENDING` before Meta call. On success, update to `SCHEDULED` + store Meta's returned `metaPostId`. On failure, `status: FAILED` + `errorMessage`.

**Why over relying solely on Meta as the source of truth:**
- Meta's `scheduled_posts` endpoint returns ad-hoc fields and can lag. Local row lets us render the user's list instantly + retry on failure.
- Allows analytics later (which posts converted to boosted ads, which AI suggested vs human authored).

**Trade-off:** Source-of-truth drift if user edits via Meta Business Suite directly. Mitigation: on `listScheduledPosts(pageId)` call, do a reconciliation pass — match local `PagePost` rows to Meta's `scheduled_posts` and flag mismatches.

### D3: Vercel Blob for media, not direct multipart to Meta
**Choice:** Upload media to Vercel Blob first → get public URL → pass URL to Meta's `/photos url=...` endpoint.

**Why over direct multipart upload:**
- Vercel Blob is already in the stack; no new dep.
- Public URL approach is well-trodden; multipart with FormData has subtle CORS/encoding pitfalls (seen during FANA script).
- Side benefit: blob URLs serve as a permanent archive of all scheduled creatives.

**Trade-off:** Two requests (Blob then Meta) vs one. Latency ~+1-2 sec; insignificant for a manual scheduling UI.

### D4: AI tool `schedulePagePost` is mutate-only, never auto-publish
**Choice:** The AI tool wraps the same server helper as the UI. Always `kind: "mutate"` so the chat surfaces a confirmation card with full caption + scheduled time before the call goes through.

**Why:**
- Publishing posts under the tenant's brand is high-trust. Even with AI's improved learning loop, never publish without explicit user OK.
- The confirmation card surfaces caption typos before they go live.

### D5: Sidebar entry "โพสต์เพจ" under "เครื่องมือ" — not top-level
**Choice:** Don't add another top-level nav item. The "เครื่องมือ" hub already collects Events/Journey/Goals; "โพสต์เพจ" fits naturally there.

**Why:**
- Top-level nav is already at 9 items (8 + AI Memory). Adding more pushes the sidebar over the comfortable visual density.
- Page-post scheduling is a daily activity for some customers but not others. Tucking it under "เครื่องมือ" lets discovery happen via the hub page without bloating the sidebar.

**Trade-off:** One more click to reach. Re-evaluate after launch if usage data warrants promotion.

### D6: Use `prisma db push` for the schema migration
Follows project convention (see memory `reference_prisma7.md`). The two new tables are purely additive; no risk to existing data.

## Risks / Trade-offs

- **Risk:** Page tokens from the new app inherit BM admin permissions but Meta sometimes returns "Cannot edit posts" mid-flight if BM role changes. Mitigation: surface the Meta error verbatim in the UI; let the user re-auth from settings.

- **Risk:** Customers might paste pfbid URLs from their Facebook share buttons (not the canonical post id format). Mitigation: include the `pfbid →` resolution helper from the FANA script (`scripts/schedule-fana-posts.ts` precedent) but it's an edit-existing-post flow, not the primary compose-new flow this change targets.

- **Risk:** Quota — Meta limits posts per page per day. Mitigation: read Meta's rate-limit headers; surface friendly error.

- **Risk:** Vercel Blob storage cost as scheduled-post media accumulates. Mitigation: tenant-scoped blob namespace + a daily cron that purges blobs for `PagePost` rows whose status is `PUBLISHED` and older than 30 days (Meta has the asset; we don't need to retain).

- **Risk:** Confusion with the existing "ครีเอทีฟ" creatives library (ad assets vs page post media). Mitigation: keep them in distinct DB tables and distinct Blob namespaces. UI clearly labels each.

## Migration Plan

1. **Phase A — Meta app + env** (≤1 day):
   - Production env: add `META_PAGE_APP_ID` + `META_PAGE_APP_SECRET` + `META_PAGE_CONFIG_ID`.
   - Verify the existing AdsLab Page Meta app's OAuth redirect URI includes `<APP_URL>/api/meta/page-oauth/callback`.

2. **Phase B — schema + connection** (~1 day):
   - Add `MetaPageConnection` + `PagePost` to schema; `prisma db push`.
   - Build `/api/meta/page-oauth/start` + `/callback`, mirroring existing `/api/meta/oauth/*` shape.
   - Settings → "Connect Page Management" button + status indicator.

3. **Phase C — server helpers + API** (~1 day):
   - `src/lib/meta/page-posts.ts` — schedule / list / cancel.
   - `/api/posts/schedule` route as the UI's primary submit target.

4. **Phase D — UI** (~1 day):
   - `/t/[slug]/posts` (list view).
   - `/t/[slug]/posts/new` (compose form).
   - Sidebar entry under "เครื่องมือ".

5. **Phase E — AI tool** (~half day):
   - `schedulePagePost` mutate tool, registered in `tools/registry.ts`.
   - System-prompt addition: when to suggest scheduling.

6. **Phase F — Ship**:
   - Type-check + lint + dogfood schedule a post on the founder's own page.
   - Commit + push + archive.

**Rollback:** delete the new routes + sidebar entry; existing ads functionality untouched. Schema-table additions can stay (zero overhead).

## Open Questions

- **Q:** Should the schedule date-time picker enforce Meta's 10-min-future minimum on the client side?
  → Yes — friendlier than waiting for the server to reject. Default to "tomorrow 18:00 BKK" to encourage thoughtful scheduling.

- **Q:** Should the AI tool's `mediaUrls` accept Vercel Blob URLs or only HTTPS Meta-reachable URLs?
  → Either. Resolve in the tool handler: if a Blob URL is passed, ensure it's public-readable before forwarding to Meta.

- **Q:** When the user disconnects the page-management Meta app, what happens to in-flight scheduled posts on Meta's side?
  → They stay scheduled on Meta until published; we just lose the ability to see/cancel them through AdsLab until they reconnect. Surface this clearly in the disconnect confirmation.
