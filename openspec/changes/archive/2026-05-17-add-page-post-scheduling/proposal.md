## Why

AdsLab is positioned as a Meta-ads platform — but real media-buyer workflow includes BOTH organic posts AND paid boosts. Today customers have to bounce between Meta Business Suite (compose + schedule organic) and AdsLab (boost the scheduled post). The handoff is the friction.

The founder dogfooded this gap on 2026-05-16 scheduling FANA Restaurant's 6 posts via a one-off Node script (`scripts/schedule-fana-posts.ts`). The script works but the founder is the only user who can run it; customer-facing equivalent doesn't exist.

This change closes the loop: customers compose → schedule → boost — all inside AdsLab. The Meta-app constraint that originally blocked this (see `reference_meta_app_type_constraint.md`) is already solved — a separate "AdsLab Page" Meta app exists with `pages_manage_posts` scope; integrating it into AdsLab is now a code-only task.

## What Changes

### Schema additions

- **NEW model `MetaPageConnection`**: separates page-management OAuth from the existing ads-only `MetaConnection`. One tenant can connect both. Stores the new Meta-app token encrypted.
- **NEW model `PagePost`**: tracks composed + scheduled posts before Meta publishes them — `{ id, tenantId, pageId, mediaUrls Json, caption, scheduledAt, metaPostId nullable, status PENDING|SCHEDULED|PUBLISHED|FAILED, errorMessage }`.

### OAuth flow

- **NEW** `/api/meta/page-oauth/start` + `/api/meta/page-oauth/callback` routes for the new Meta app (separate from the existing `/api/meta/oauth/*`).
- **NEW env vars**: `META_PAGE_APP_ID`, `META_PAGE_APP_SECRET`, `META_PAGE_CONFIG_ID`. Documented in `.env.example`.

### Server-side post helpers

- **NEW** `src/lib/meta/page-posts.ts`:
  - `uploadMedia(pageId, file)` → uploads to Vercel Blob, returns public URL.
  - `schedulePost({ pageId, caption, mediaUrls, scheduledAt })` → calls Graph API `/photos`, `/videos`, or `/feed` (album) with `scheduled_publish_time`; persists `PagePost` row.
  - `listScheduledPosts(pageId)` → reads from Meta + reconciles with local `PagePost` rows.
  - `cancelScheduledPost(postId)` → calls Graph DELETE + updates row.

### UI surfaces

- **NEW route** `/t/[slug]/posts` — page picker → list of scheduled posts → "Create post" CTA.
- **NEW route** `/t/[slug]/posts/new` — compose form with media uploader (drag/drop, multi-file), caption textarea (with character counter), schedule date-time picker (defaults to next "good time" slot 18:00 BKK).
- **NEW** sidebar entry "โพสต์เพจ" under the "เครื่องมือ" hub (no top-level slot — keep the IA flat).

### AI tool integration (Tier 2.5)

- **NEW** AI tool `schedulePagePost(pageId, caption, mediaUrls, scheduledAt)` so the in-chat AI can offer "I'll draft a follow-up post and schedule it for tomorrow 18:00" — useful when AI suggests "creative refresh" from Daily Report.

## Capabilities

### New Capabilities
- `page-post-scheduling`: Compose + schedule + publish organic Facebook page posts from inside AdsLab, with media upload, multi-page picker, and AI-assisted composition. Closes the organic-post + paid-boost loop.

### Modified Capabilities
None at spec level. The existing `ai-execution-tools-tier-2` capability gets a passive boost when `schedulePagePost` lands (Tier 2.5).

## Impact

- **New routes**: `/api/meta/page-oauth/*`, `/t/[slug]/posts`, `/t/[slug]/posts/new`.
- **New files**: `src/lib/meta/page-posts.ts`, `src/components/posts/*`, `src/lib/ai/tools/schedule-page-post.ts`, OAuth route handlers.
- **Schema migration**: ADD `MetaPageConnection` + `PagePost` tables. Use `prisma db push` per project convention (no destructive migrations).
- **Env vars**: 3 new (`META_PAGE_APP_ID`, `META_PAGE_APP_SECRET`, `META_PAGE_CONFIG_ID`).
- **Vercel Blob**: reused (already present for creatives). New `posts/` namespace inside the same bucket.
- **No breaking changes** to existing ads-only OAuth or any ads-related code paths.

## Out of Scope (deferred)

- **Cross-posting to Instagram** — Meta's IG API has its own quirks; ship FB-only first.
- **Auto-generating post copy from a Daily Report insight** — requires a separate AI prompt design.
- **A/B testing organic post variants** — too speculative; revisit after seeing real usage.
- **Reply automation / DM handling** — different scope entirely.

## Estimated effort

~3-4 days end-to-end (1 day Meta app + env wiring, 2 days OAuth + helpers + post API, 1 day UI + AI tool). Already partially proven: the one-off `scripts/schedule-fana-posts.ts` validates the Graph-API call shapes.
