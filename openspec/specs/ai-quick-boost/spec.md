# Spec: AI Quick Boost

**Capability:** Natural-language to bulk Meta campaign creation. The user pastes a free-form Thai/English message (typically from a client request) and AdsLab parses, plans, and creates the campaigns after confirmation.

## Purpose

Eliminate the 15-20 minute manual flow that media buyers do many times per day:
1. Receive client message with N video URLs + budget + deadline
2. Translate each URL → post ID, find owner page → ad account
3. Create N campaigns one-by-one in Meta Ads Manager (or our builder)

AdsLab replaces this with: paste message → review plan → 1 confirmation click → N campaigns created in parallel.

## Data Model

### `BoostJob` (prisma/schema.prisma)

| Field | Type | Notes |
|-------|------|-------|
| `id` | cuid | |
| `tenantId` | FK Tenant | Cascade on tenant delete |
| `userId` | string | Who submitted the job |
| `promptText` | string | Original raw text (audit) |
| `parsedBrief` | Json | `{ intent, briefs }` — full plan before user edits |
| `executionResults` | Json? | Per-brief result `{ briefId, status, campaignMetaId?, error? }[]` |
| `status` | string | `planned` \| `executing` \| `executed` \| `failed` \| `cancelled` |
| `kpiText` | string? | Final KPI string the user confirmed |
| `purposeText` | string? | Final purpose string the user confirmed |
| `createdAt` | timestamp | |
| `executedAt` | timestamp? | |

Index: `(tenantId, createdAt)` for "my recent boost jobs" history view.

## Contract

### Parser — `src/lib/ai/boost-parser.ts`

Input: free-form text (Thai/English).
Output (zod-validated):
```ts
{
  budgetMode: "per_post" | "total",
  budgetThb: number,
  objectiveHint: "views" | "engagement" | "clicks" | "conversions" | "reach" | "leads" | "unknown",
  scheduleEndIso: string | null,
  scheduleStartIso: string | null,
  kpi: null | { type, target, unit, direction },
  purpose: string | null,
  assumptions: string[],
  notes: string,
}
```

Rules enforced via system prompt:
- "โพสละ N บาท" → `per_post`; default to `per_post` if ambiguous
- "Views" / "ยอดวิว" → `views`; "เอนเกจ" → `engagement`; "ขาย" / "Sales" → `conversions`
- Bangkok timezone math: "พรุ่งนี้ 10:00" relative to current Bangkok date → UTC ISO
- KPI populated ONLY for explicit targets ("ให้ได้ 10000 views", "CPV ไม่เกิน 0.5")
- `purpose` populated ONLY for explicit intent ("เพื่อ launch", "ทดสอบ creative")

Model: Claude Sonnet via OpenRouter (`role: "analysis"`). Temperature 0.

### URL Resolver — `src/lib/meta/url-resolver.ts`

Patterns supported:
- `facebook.com/reel/{id}`
- `facebook.com/share/v/{shortcode}/` and `share/r/{shortcode}` — follows redirect
- `facebook.com/{page_or_handle}/posts/{id}`
- `facebook.com/{page_or_handle}/videos/{id}`
- `fb.watch/{shortcode}/` — follows redirect

For each URL:
1. Normalize + follow redirect if needed
2. Extract content id
3. Query Meta: `GET /{id}?fields=id,from{id,name},permalink_url,source`
4. Build boostable post id as `{page_id}_{content_id}` for reel/video

Returns: `{ originalUrl, canonicalUrl, pageId, pageName, postId, mediaType, permalinkUrl }` per URL.

Errors per URL bundled separately so a partial batch still proceeds.

### Brief Builder — `src/lib/boost/brief-builder.ts`

For each resolved URL, build a `BoostBrief`:

| Field | How it's chosen |
|-------|-----------------|
| `metaAccountId` | Default: first active ad account on tenant. User overrides in UI. |
| `campaignName` | `AdsLab Boost · {YYYY-MM-DD} · {pageName, 24 chars} · {postId tail, 16 chars}` |
| `objective` | `OBJECTIVE_BY_HINT[intent.objectiveHint]` — `views`/`engagement` → `OUTCOME_ENGAGEMENT` |
| `optimizationGoal` | media-aware: reel/video + views → `THRUPLAY`; engagement → `POST_ENGAGEMENT`; clicks → `LINK_CLICKS`; reach → `REACH`; leads → `LEAD_GENERATION` |
| `billingEvent` | Always `IMPRESSIONS` (Meta best-practice for video boost) |
| `lifetimeBudgetThb` | `budgetMode === "per_post"` → `budgetThb`; otherwise `budgetThb / N` |
| `startTime` | `intent.scheduleStartIso` if present; else `now + 5 min` |
| `endTime` | `intent.scheduleEndIso` if present; else `start + 24h` |
| `targeting` | Defaults to Thailand-only, age 18-65 (boost flows assume local audience) |

Per-brief `warnings[]` array surfaces issues without blocking: "Page not in cache", "no end time → defaulted to +24h", "no objective → using Engagement".

### API — `POST /api/boost/plan?tenantSlug=<slug>`

Roles: OWNER + MEDIA_BUYER.

Body: `{ promptText: string }` (10-4000 chars).

Behavior:
1. `parseBoostPrompt(promptText)` — Claude call
2. `extractUrls(promptText)` — regex
3. `resolveAllUrls(urls, accessToken)` — parallel Meta API calls
4. `buildBriefs(intent, resolved, accountByPageId)`
5. Persist `BoostJob` row in `planned` status with intent + briefs + kpiText + purposeText

Response: `{ ok: true, jobId, intent, briefs, urlErrors }` or `{ ok: false, stage, error }`.

### API — `POST /api/boost/execute?tenantSlug=<slug>`

Roles: OWNER + MEDIA_BUYER.

Body: `{ jobId, initialStatus: "PAUSED" | "ACTIVE", briefs: BoostBrief[] }` (briefs may be edited from planned version).

Validations:
- Job must exist + belong to tenant
- Job status must be `planned` (409 otherwise — no re-execute)
- For `ACTIVE`: UI must have gated on `kpiText` + `purposeText` being filled (re-validated server-side via the persisted job row)

Behavior:
1. Mark job → `executing`
2. `Promise.allSettled` over briefs → `createCampaignTree()` per brief
3. Persist `executionResults[]` + flip status to `executed` or `failed` (based on whether all succeeded)

Response: `{ ok: true, results: ExecuteResult[] }` where each result has either `campaignMetaId` (success) or `error` (failure).

## Frontend

### `/t/[slug]/boost` page

Server entry checks Meta connection + role gate.

Client component (`BoostClient`):
1. **Input section** — textarea + example button + "วิเคราะห์ + วางแผน" CTA
2. **Intent summary** — shows AI's reading + assumptions list (orange ⚠ items)
3. **URL errors** — per-URL resolve failures
4. **KPI + Purpose form** — two text inputs, prominent yellow card. Required for "เปิดทันที" path; optional for "PAUSED" path
5. **Brief cards** — one per campaign, editable (account, budget, start, end, name), removable
6. **Sticky bottom bar** — shows total ฿ + two CTAs:
   - "สร้างเป็น Draft (PAUSED)" — always enabled
   - "ยืนยันใช้เงิน ฿X,XXX + เปิดทันที" — gated on KPI + purpose filled; pops confirm() before publish
7. **Results view** — replaces brief stack on success; per-brief success/fail card with link to campaign

### Sidebar nav

"บูสต์ด่วน" added as 2nd nav item (between Dashboard + Campaigns) with `Zap` icon. Reasoning: this is the most-used action for daily media buyers, deserves top-2 placement.

## Safety

- Plan never executes implicitly — always requires explicit POST to `/execute`
- "ACTIVE" status (immediate spend) requires KPI + purpose AND a `confirm()` dialog showing the total spend
- All campaigns are CBO + lifetime budget (predictable cap — won't overspend even if user forgets to pause)
- Default Thailand-only targeting (won't accidentally serve to wrong country)
- Status default is PAUSED; user must intentionally opt into ACTIVE

## Meta API restrictions discovered during E2E (May 2026, API v23.0)

Several Meta-side rules were learned via real campaign creation against the founder's demo tenant. Future agents extending this feature should be aware:

1. **THRUPLAY only works under `OUTCOME_AWARENESS`** — pairing with `OUTCOME_ENGAGEMENT` triggers "performance goal cannot be used with campaign objective". Brief builder hardcodes `views → OUTCOME_AWARENESS`.

2. **THRUPLAY rejects `destination_type=ON_AD`** — only MESSENGER/UNDEFINED/WEBSITE/APP are valid. Leave `destination_type` unset for THRUPLAY (same as REACH/IMPRESSIONS).

3. **Thailand audiences require `age_min ≥ 20`** — `age_min=18` is rejected for ads served in Thailand. Brief builder defaults to 20.

4. **Some reels are NOT promotable** — Meta returns "Post ID X cannot be promoted in ads. Please choose a post from another page". Causes: standalone reel not in Page's promotable pool, video monetization not approved, paid partnership content, or post too old. The UI surfaces a Thai-language hint explaining likely causes. Infrastructure-wise the API call is correctly formed; this is a per-post content restriction.

## Acceptance

- [x] Parser handles the founder's 4 real client message variants correctly (verified)
- [x] URL resolver handles `share/v/...` redirect + `reel/...` direct + maps to known Page (4/4 founder URLs resolve)
- [x] Plan endpoint returns valid briefs end-to-end
- [x] Execute endpoint creates campaigns via existing `createCampaignTree()`
- [x] Meta API restrictions above are correctly handled by brief builder
- [x] UI surfaces actionable "not promotable" error guidance
- [x] UI gates ACTIVE on KPI + purpose presence
- [x] Sidebar shows "บูสต์ด่วน" item
- [ ] End-to-end success on a known-boostable post (requires user to provide a fresh ad-eligible Page reel — the demo tenant's available reels all hit the per-post restriction described above)

## Future Work (out of scope for this change)

- AI Chat tool-call wrapper so the same flow works inline in `/ai` chat
- Boost job history page `/boost/history` listing past BoostJob rows
- Per-page → ad account preference learning ("client X always goes to account Y")
- Retry button on failed briefs (currently must re-paste prompt)
