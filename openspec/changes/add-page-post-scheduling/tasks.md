## 1. Meta app + env (≤ 0.5 day, no code)

- [ ] 1.1 Verify the existing "AdsLab Page" Meta app (App ID `2010104606257244`) has redirect URI `<APP_URL>/api/meta/page-oauth/callback` added.
- [ ] 1.2 Get + add to Vercel env: `META_PAGE_APP_ID`, `META_PAGE_APP_SECRET`, `META_PAGE_CONFIG_ID`.
- [ ] 1.3 Update `.env.example` documenting the 3 new vars.

## 2. Schema

- [ ] 2.1 Add `MetaPageConnection` model to `prisma/schema.prisma` — mirror `MetaConnection` shape but separate.
- [ ] 2.2 Add `PagePost` model — `{ id, tenantId, pageId, mediaUrls Json, caption, scheduledAt, metaPostId, status, errorMessage, createdAt, updatedAt }` with `status` enum `PENDING|SCHEDULED|PUBLISHED|FAILED|CANCELLED`.
- [ ] 2.3 Run `prisma db push` (no migration file per project convention).

## 3. OAuth + connection management

- [ ] 3.1 `src/lib/meta/page-oauth.ts` — build URL, exchange code, store encrypted token. Reuse `META_SCOPES` pattern but with page-management scopes.
- [ ] 3.2 `src/app/api/meta/page-oauth/start/route.ts` — generate signed state, redirect to Meta.
- [ ] 3.3 `src/app/api/meta/page-oauth/callback/route.ts` — verify state, exchange code, upsert `MetaPageConnection`, redirect to settings.
- [ ] 3.4 `src/lib/meta/page-client.ts` — `getPageConnection(tenantId)` + `getFreshPageAccessToken(connection)` helpers (token refresh logic).
- [ ] 3.5 Settings page: "Connect Page Management" button + status panel.

## 4. Server helpers

- [ ] 4.1 `src/lib/meta/page-posts.ts`:
  - `uploadMediaToBlob(tenantId, file): Promise<{ url, contentType }>` (Vercel Blob, namespace `posts/<tenantId>/`)
  - `schedulePost({ tenantId, pageId, caption, mediaUrls, scheduledAt }): Promise<PagePost>`
  - `listScheduledPosts(tenantId, pageId): Promise<PagePost[]>` (reconciles local + Meta)
  - `cancelScheduledPost(tenantId, postId): Promise<void>`
- [ ] 4.2 Internal: detect photo vs video vs album by file count + content-type; route to correct Meta endpoint (`/photos`, `/videos`, or `/feed` with `attached_media`).
- [ ] 4.3 Update `MetaPage` cache list flow (or add new page-list fetcher for page-management connection) so the page picker has real names.

## 5. API routes

- [ ] 5.1 `src/app/api/posts/upload/route.ts` — POST multipart, returns blob URL.
- [ ] 5.2 `src/app/api/posts/schedule/route.ts` — POST JSON, returns the created `PagePost`.
- [ ] 5.3 `src/app/api/posts/[id]/cancel/route.ts` — DELETE, calls helper.

## 6. UI

- [ ] 6.1 `src/app/t/[tenantSlug]/posts/page.tsx` — Server Component list view. Empty state if no page connection.
- [ ] 6.2 `src/components/posts/posts-list.tsx` — table with media thumb + status badge + cancel action.
- [ ] 6.3 `src/app/t/[tenantSlug]/posts/new/page.tsx` — Server Component shell.
- [ ] 6.4 `src/components/posts/compose-form.tsx` — Client Component: page picker → media uploader (drag-drop, multi-file, preview thumbnails) → caption textarea (1000-char limit) → schedule date-time picker (default = tomorrow 18:00 BKK).
- [ ] 6.5 Add "โพสต์เพจ" entry to the "เครื่องมือ" hub page.

## 7. AI tool

- [ ] 7.1 `src/lib/ai/tools/schedule-page-post.ts` — mutate tool. Input: `{ pageId, caption, mediaUrls: string[], scheduledAt: ISO datetime }`. Handler wraps `schedulePost` from server helper.
- [ ] 7.2 Register in `src/lib/ai/tools/registry.ts`.
- [ ] 7.3 Extend `captureRecommendationFromToolCall` mapping: `schedulePagePost` → `actionType: "refresh_creative"`, `targetKind: "ad"` (or new kind `"page_post"`? — decide during impl, lean toward `"ad"` since the post will likely be boosted).
- [ ] 7.4 System-prompt addition: when AI suggests "refresh creative" in Daily Report, it MAY offer to draft + schedule a new page post — but never auto-publish without confirmation card.

## 8. Cleanup cron

- [ ] 8.1 Piggyback `/api/cron/daily-report` (same pattern as outcomes + rules) — enumerate `PagePost` WHERE status=PUBLISHED AND scheduledAt < now - 30d → delete media blobs → clear `mediaUrls` field.
- [ ] 8.2 Skip if `FEATURE_PAGE_POST_CLEANUP=off`.

## 9. Dogfood + verify

- [ ] 9.1 Connect founder's FANA page (or test page) via Settings.
- [ ] 9.2 Schedule one test post via UI → verify on Meta Business Suite Planner.
- [ ] 9.3 Schedule via AI chat → verify confirmation card appears with full caption + media.
- [ ] 9.4 Cancel a scheduled post → verify Meta no longer has it.
- [ ] 9.5 `npx tsc --noEmit` clean.

## 10. Ship + archive

- [ ] 10.1 Commit + push.
- [ ] 10.2 Sync canonical spec.
- [ ] 10.3 Archive change to `openspec/changes/archive/YYYY-MM-DD-add-page-post-scheduling`.

## 11. Out of scope (do NOT include)

- 11.1 Cross-posting to Instagram (separate change).
- 11.2 AI auto-composing post copy from Daily Report insights (needs prompt design; separate change).
- 11.3 Editing/regenerating already-published posts.
- 11.4 Reply automation / DM handling.
- 11.5 A/B testing organic post variants.
