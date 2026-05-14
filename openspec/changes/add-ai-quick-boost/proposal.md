# AI Quick Boost — Natural-language Bulk Campaign Creation

## Why

The founder's daily reality (verified with a real client request):

> บูสต์วีดีโอให้หน่อยครับ เป็น Views โพสละ 1250 บาท ให้จบพรุ่งนี้ 10.00 น.
> https://facebook.com/share/v/1AtdSLKovS/
> https://facebook.com/reel/2046794962859921
> https://facebook.com/reel/1002568998876934
> https://facebook.com/reel/994832796325634

Today this takes ~15-20 min in either Meta Ads Manager OR our `/campaigns/new` builder:
- Resolve 4 URLs → post IDs (Meta Graph Explorer)
- Look up which Page owns each post → which ad account is connected
- Create 4 campaigns one-by-one with identical settings
- Tedious AND error-prone (wrong account, wrong objective, wrong end time)

The whole point of AdsLab is to eliminate this drudgery. Paste the client message → AdsLab parses + plans + (after confirm) creates all 4 campaigns. **2 clicks instead of 15 minutes.**

This is the single most important differentiator vs. Meta Ads Manager — and a perfect demo for the Course (record a 60-second video of "พิมพ์ → ยืนยัน → ดู 4 campaigns เกิดขึ้นพร้อมกัน").

## What Changes

### New page `/t/[slug]/boost`

- Big textarea: "วางข้อความจากลูกค้าที่นี่"
- Submit → server parses + resolves → returns brief list
- Confirmation UI: card stack showing all detected campaigns (1 card per URL)
- Per-card: editable name / account / budget / end-time + "ลบ" to skip
- Bottom CTA: "สร้าง N แคมเปญ (PAUSED)" or "สร้าง + เปิดทันที"
- After publish: success summary + link to each campaign

### New backend pieces

1. **`src/lib/ai/boost-parser.ts`** — Claude Sonnet with structured output:
   - Input: free-form Thai/English text + URLs
   - Output: `{ urls[], budget_per_post_thb, budget_mode: "per_post" | "total", objective_hint, schedule_end_iso, kpi, purpose, notes }`
   - `kpi`: parsed target metric — `{ type: "views" | "engagement" | "clicks" | "cpv" | "cpe" | "cpc" | "reach", target?: number, unit?: string }` (nullable if not in prompt)
   - `purpose`: free-form Thai/English string — why is this boost being run (awareness, launch, creative test, etc.). Nullable if not in prompt.
   - Schema validated with zod

**Critical rule:** if `kpi` OR `purpose` is null after parsing, the confirmation UI MUST require the user to fill them in before any "เปิดทันที" button is enabled. PAUSED-only publish is still allowed without these fields (lower stakes — can be reviewed in /campaigns later), but the assumption is that media buyers should ALWAYS know why + what success looks like.

2. **`src/lib/meta/url-resolver.ts`** — Per URL:
   - Detect type: reel / share-link / video / post
   - Resolve to canonical `{ pageId, pageName, postId, mediaType: "reel" | "video" | "image" }`
   - For `share/v/{shortcode}` links: follow HTTP redirect to get the resolved reel URL
   - For `reel/{id}` links: use the reel id directly; convert to boostable post id via `GET /{reel_id}?fields=...`

3. **`src/lib/boost/brief-builder.ts`** — Combine parser output + resolved URLs:
   - Map page → ad account (via `MetaPage` table)
   - One brief per URL with sensible defaults:
     - Campaign name: auto-generated from post + date (`AdsLab Boost · 2026-05-15 · 1Atd...`)
     - Objective: `OUTCOME_ENGAGEMENT`
     - Optimization goal: `VIDEO_VIEWS` for video/reel (extensible later)
     - Billing event: `IMPRESSIONS`
     - Budget: lifetime (calculated from per-post amount × duration)
     - End time: parsed from prompt (Asia/Bangkok timezone)
     - Start time: now + 5 min (safe margin for Meta delay)
     - Creative: `{ kind: "existing_post", postId }`
     - Initial status: PAUSED (always — user must confirm)

4. **`POST /api/boost/plan`** — Takes prompt text → returns brief list (preview, doesn't create anything)
5. **`POST /api/boost/execute`** — Takes confirmed brief list → fires `/api/meta/campaigns/create` for each in parallel → returns per-brief result

### New table `BoostJob`

Persists every boost job for audit + replay:
- id, tenantId, userId, promptText, parsedBrief (Json), executionResults (Json), createdAt, executedAt, status

So users can: review past jobs, retry failed ones, "rerun same prompt with different posts" pattern.

### Sidebar nav

Add "บูสต์ด่วน" (with ⚡ icon) as a new top-level item between "แคมเปญ" and "กลุ่มเป้าหมาย". Or under เครื่องมือ — TBD per UX preference.

### Future: AI Chat integration (Phase 2 — out of scope for this change)

Once the `/boost` page works, the same parser + executor will be exposed as a `quick_boost` tool in the AI Chat sidebar so the user can fire jobs while chatting about other things.

## Impact

- New spec: `ai-quick-boost`
- Affected models: new `BoostJob` table (no breaking changes to existing)
- Affected libs: new `src/lib/ai/boost-parser.ts`, `src/lib/meta/url-resolver.ts`, `src/lib/boost/brief-builder.ts`, `src/lib/boost/execute.ts`
- Affected API routes: `POST /api/boost/plan`, `POST /api/boost/execute`
- Affected UI: new `/t/[slug]/boost/page.tsx` + client component; sidebar nav update
- Reuses: existing `/api/meta/campaigns/create` endpoint (no changes needed)
- Cost: ~$0.003 per parse (Claude Sonnet, small prompt), free thereafter

## Open Questions

1. **Reel boostability** — Meta Marketing API requires specific permissions to boost Reels. The page → ad account mapping must use an account that the user is admin of AND that the page is connected to. Need to validate this upfront and surface clear errors if not boostable.

2. **Budget interpretation** — "โพสละ 1250 บาท" is unambiguous (per post). But "งบ 5000" alone is ambiguous (per post or total?). The parser should ask Claude to interpret per `budget_mode` field; if ambiguous, default to `per_post` and surface the assumption to the user for confirmation.

3. **Auto-publish vs PAUSED-by-default** — User confirmed: "เปิดทันที" IS allowed, but ONLY after KPI + purpose are explicitly captured (either parsed from prompt or filled in confirmation UI), AND only with a second click on a "ยืนยันใช้เงินจริง ฿X,XXX" button that shows the total spend amount prominently.

4. **KPI persistence** — every `BoostJob` row saves the `kpi` + `purpose` so the AI Optimization Center can later evaluate "ได้ตาม KPI ที่ตั้งไว้หรือเปล่า" instead of guessing what the user wanted.
