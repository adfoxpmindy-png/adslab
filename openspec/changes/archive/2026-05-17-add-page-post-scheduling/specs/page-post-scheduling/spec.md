## ADDED Requirements

### Requirement: Separate page-management Meta connection
The system SHALL maintain a `MetaPageConnection` table distinct from the existing `MetaConnection`. Each tenant MAY have zero or one of each. The page connection stores the page-management Meta app's user access token (encrypted) and includes scopes `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`.

The two connection types MUST NOT share OAuth handlers, env vars, or tokens. Code that publishes/schedules posts MUST read tokens exclusively from `MetaPageConnection`; code that runs ads MUST read tokens exclusively from `MetaConnection`.

#### Scenario: Tenant connects both
- **WHEN** a tenant authorizes the ads app AND the page-management app
- **THEN** they have one row in `MetaConnection` and one row in `MetaPageConnection`, each with independent expiry + status fields

#### Scenario: Tenant connects only page management
- **WHEN** a tenant authorizes only the page-management app (e.g. agency that doesn't run ads through AdsLab)
- **THEN** they have a `MetaPageConnection` row but no `MetaConnection`; the `/t/[slug]/posts` flows work; the ads dashboard shows the "connect Meta Ads" empty state

### Requirement: Compose + schedule a new page post
The system SHALL provide a UI at `/t/[slug]/posts/new` that lets a user select a page (from their page-management connection), upload one or more media files (image OR video), write a caption (Thai/English), and pick a scheduled publish time at least 10 minutes in the future.

On submit, the system MUST:
1. Upload media to Vercel Blob (tenant-scoped namespace `posts/<tenantId>/`)
2. Create a `PagePost` row with `status: PENDING`
3. Call Meta Graph API with `scheduled_publish_time` (Unix seconds)
4. On success, update the row to `status: SCHEDULED` + store the returned `metaPostId`
5. On failure, update to `status: FAILED` + populate `errorMessage`
6. Redirect to `/t/[slug]/posts` (list view)

#### Scenario: Photo post scheduled successfully
- **WHEN** a user uploads one image + a caption + picks a time 2 hours from now
- **THEN** the post appears in the `/posts` list with status `SCHEDULED`, the actual publish happens at the chosen time, and after Meta publishes it the local row's status updates to `PUBLISHED` (via reconciliation on next list view)

#### Scenario: Album post (multiple images)
- **WHEN** a user uploads 2-10 images in the same compose form
- **THEN** the system uploads each as an unpublished photo, collects the `media_fbid`s, and creates a single feed post with `attached_media[]` plus `scheduled_publish_time` — matching the pattern proven in `scripts/schedule-fana-posts.ts`

#### Scenario: Video post (Reel)
- **WHEN** a user uploads a single video file
- **THEN** the system calls Meta's `/videos` endpoint with the Blob URL and the scheduled time; the result appears in Meta as a scheduled Reel

#### Scenario: Time too soon
- **WHEN** a user picks a scheduled time less than 10 minutes from now
- **THEN** the UI rejects client-side before submit; the server also rejects defensively

### Requirement: List + cancel scheduled posts
The system SHALL provide `/t/[slug]/posts` showing all scheduled, pending, and recently-published posts for the selected page. Each row shows: media thumbnail, caption snippet, scheduled time, status badge.

Users SHALL be able to cancel a `SCHEDULED` post via a "Cancel" action. This calls Meta DELETE on the scheduled post id and updates the local row to status `CANCELLED`.

#### Scenario: Reconcile local with Meta on list view
- **WHEN** the user opens `/t/[slug]/posts`
- **THEN** the system fetches `/PAGE_ID/scheduled_posts` from Meta, matches against local `PagePost` rows by `metaPostId`, and updates any drift (e.g. a row marked SCHEDULED locally but absent on Meta becomes CANCELLED with an explanatory note)

#### Scenario: Cancel before publish
- **WHEN** the user cancels a post 30 minutes before its scheduled time
- **THEN** Meta removes it from the page's scheduled queue; AdsLab marks the local row CANCELLED; the publish never happens

### Requirement: AI tool `schedulePagePost` (mutate)
The system SHALL provide an AI tool of kind `mutate` that the chat agent can call to draft + schedule a post. Tool input includes `pageId`, `caption`, `mediaUrls` (array of HTTPS URLs), `scheduledAt` (ISO datetime).

The tool MUST route through the same server helper as the UI — same Vercel Blob upload (when receiving non-Blob URLs), same `PagePost` row creation, same Meta call. Confirmation card in the chat shows: page name, caption full text, scheduled time, and media preview.

#### Scenario: AI suggests a follow-up post after Daily Report
- **WHEN** the Daily Report identifies a creative-refresh opportunity and the AI proposes "schedule a follow-up post tomorrow 18:00 with this caption" and the user approves the confirmation card
- **THEN** a new `PagePost` is scheduled, an `AIRecommendation` row of type `refresh_creative` is captured (Tier 1 learning loop), and the post lives in `/posts` like any user-composed one

### Requirement: Sidebar discoverability
The system SHALL surface "โพสต์เพจ" as an entry inside the "เครื่องมือ" hub page (not as a top-level sidebar item). The hub page lists the new entry alongside existing tools (Events / Journey / Goals).

#### Scenario: User finds the new feature
- **WHEN** a user clicks "เครื่องมือ" in the sidebar
- **THEN** they see "โพสต์เพจ" as one of the hub cards with a description "เขียน + ตั้งเวลาโพสต์เพจ Facebook"

### Requirement: Vercel Blob cleanup
The system SHALL automatically delete blob assets associated with `PagePost` rows whose status is `PUBLISHED` and `scheduledAt` is more than 30 days in the past. Meta retains the asset on its own infra; AdsLab no longer needs the local copy.

#### Scenario: Cron-driven cleanup
- **WHEN** the daily cron runs (existing `/api/cron/daily-report` piggyback)
- **THEN** the system enumerates eligible `PagePost` rows, deletes their blob URLs via the Vercel Blob API, and clears the `mediaUrls` field on the row (keeping the row itself for audit/history)
