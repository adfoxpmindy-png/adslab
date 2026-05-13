# Tasks: add-campaign-builder (Stage 3)

เป้าหมาย: สร้าง campaign จากศูนย์ใน AdsLab ได้

ระยะเวลารวม: ~2 อาทิตย์ (10 working days)
แต่ละ task ออกแบบให้ใช้เวลา 2-5 ชั่วโมง และ system ยัง deployable หลังจบ

---

## Task 1 — Schema: enum + new tables (1 ชม.)
- [x] เพิ่ม `CampaignActionType.CREATE`
- [x] เพิ่ม model `MetaAdSet` (id, metaCampaignId FK, metaAdSetId, name, dailyBudget, lifetimeBudget, targeting Json, optimizationGoal, billingEvent, startTime, endTime, status, lastFetchedAt)
- [x] เพิ่ม model `MetaAd` (id, metaAdSetId FK, metaAdId, name, status, creativeId, lastFetchedAt)
- [x] เพิ่ม model `MetaPage` (id, metaConnectionId FK, metaPageId, name, accessToken encrypted, category, lastFetchedAt)
- [x] `prisma db push` + regenerate client

## Task 2 — Pages sync service (2 ชม.)
**Goal:** ดึง Pages ที่ user เป็น admin ผ่าน /me/accounts + เก็บ page access token (encrypted) เพื่อใช้สร้าง creative

- [x] `src/lib/meta/pages.ts` — `syncPages(tenantId)`
- [x] เรียก `/me/accounts?fields=id,name,access_token,category` (page tokens จาก user token)
- [x] Encrypt page access token ด้วย `encrypt()` ก่อนเก็บ
- [x] Upsert ลง MetaPage
- [x] Endpoint: `GET /api/meta/pages?tenantSlug=` → list pages (ไม่ส่ง token)

## Task 3 — Audiences read service (2 ชม.)
**Goal:** ดึง custom + lookalike + pixel audiences ของแต่ละ ad account

- [x] `src/lib/meta/audiences.ts` — `listAudiences(tenantId, metaAccountId)`
- [x] เรียก `/<act_id>/customaudiences?fields=id,name,subtype,approximate_count,description`
- [x] subtype enum: CUSTOM, WEBSITE (pixel-based), LOOKALIKE, ENGAGEMENT, etc.
- [x] Cache 1 ชม. ใน MetaInsightCache (reuse existing table with scope="audiences:act_xxx")
- [x] Endpoint: `GET /api/meta/audiences?tenantSlug=&metaAccountId=`

## Task 4 — Interest search service (1.5 ชม.)
**Goal:** ใช้ Meta's targeting search API เพื่อ autocomplete interests

- [x] `searchInterests(query)` — `GET /search?type=adinterest&q=...`
- [x] Cache results ใน-memory (LRU) 24 ชม. ต่อ query
- [x] Endpoint: `GET /api/meta/targeting-search?q=...&type=interest`
- [x] Future: ขยายไป `behavior`, `demographics` types

## Task 5 — Image upload service (2 ชม.)
**Goal:** Upload image จาก browser → Meta /adimages → ได้ image_hash

- [x] `src/lib/meta/images.ts` — `uploadImage(tenantId, metaAccountId, fileBuffer)`
- [x] เรียก `/act_<id>/adimages` with multipart form-data (`bytes`=base64)
- [x] Validate ฝั่งเราก่อนส่ง: size ≤ 8MB, mime image/jpeg|image/png
- [x] Endpoint: `POST /api/meta/upload-image?tenantSlug=&metaAccountId=` (multipart)
- [x] Return `{ hash, width, height }` ให้ wizard เก็บ

## Task 6 — Page posts list (1 ชม.)
**Goal:** เลือก existing post จาก Page เพื่อ promote

- [x] `listPagePosts(pageId, pageAccessToken)` — `/<page_id>/promotable_posts?fields=id,message,created_time,full_picture`
- [x] Endpoint: `GET /api/meta/pages/[pageId]/posts?tenantSlug=`

## Task 7 — Core builder service (3 ชม.)
**Goal:** ฟังก์ชัน `createCampaignTree()` รับ wizard input → สร้าง campaign + adset + ad ใน Meta + sync เข้า DB + audit log

- [x] `src/lib/meta/campaign-create.ts` — `createCampaignTree({ tenantId, userId, ...wizardInput })`
- [x] Step A: `POST /act_<id>/campaigns` with { name, objective, status: PAUSED, special_ad_categories, daily_budget? }
- [x] Step B: `POST /act_<id>/adsets` with { name, campaign_id, daily_budget?, lifetime_budget?, targeting Json, optimization_goal, billing_event, status: PAUSED, start_time, end_time? }
- [x] Step C: Create creative — ถ้า existing post: `POST /act_<id>/adcreatives` with object_story_id=post_id. ถ้า new image: `POST /act_<id>/adcreatives` with object_story_spec (page_id + link_data + image_hash + message + call_to_action)
- [x] Step D: `POST /act_<id>/ads` with { name, adset_id, creative={creative_id}, status: PAUSED }
- [x] Audit log: CREATE row with afterValue={campaignId, adSetId, adId}
- [x] Sync MetaCampaign + MetaAdSet + MetaAd rows
- [x] On failure mid-step: ไม่ rollback อัตโนมัติ (Meta คิดเงินไป chargeup แล้ว); return partial state + error

## Task 8 — Validation + Zod schema (2 ชม.)
- [x] Zod schema for full wizard payload (discriminated by step)
- [x] Server-side validation matching Meta rules (budget min/max, name lengths, targeting required fields)
- [x] API: `POST /api/meta/campaigns/create?tenantSlug=` — body: full wizard state
- [x] Role: OWNER + MEDIA_BUYER

## Task 9 — Wizard UI scaffold (3 ชม.)
- [x] หน้าใหม่ `/t/<slug>/campaigns/new`
- [x] `WizardShell` component — 3-step progress indicator + Next/Back nav
- [x] State management via useReducer ใน parent + persisted localStorage
- [x] Draft autosave hook every 5s
- [x] Resume-draft banner ที่ /campaigns page ถ้า draft อยู่

## Task 10 — Wizard Step 1: Campaign (2 ชม.)
- [x] Form fields: ad account select, name input, objective select, special_ad_categories (multi-select), budget mode radio (CBO/ABO), budget input (if CBO)
- [x] Validation: name required, objective required, budget ≥ ฿20 (if CBO)
- [x] Next button enabled when valid

## Task 11 — Wizard Step 2: Ad Set (4 ชม.)
- [x] Form sections:
  - Name + budget (if ABO)
  - Targeting:
    • Location picker (Thailand default, autocomplete city/region)
    • Age range slider (18-65+)
    • Gender radio (All / Male / Female)
    • Interests autocomplete (search /api/meta/targeting-search)
    • Audience picker (multi-select from /api/meta/audiences)
  - Placements (Auto / Manual toggle + checkboxes)
  - Schedule (start now / scheduled + end date optional)
  - Optimization goal (auto-suggested per objective)
- [x] Validation: location ≥ 1, name required, ABO budget ≥ ฿20, etc.

## Task 12 — Wizard Step 3: Ad + creative (4 ชม.)
- [x] Form sections:
  - Name input
  - Page picker (from /api/meta/pages)
  - Creative source toggle: existing post / new image
  - If existing: post picker (thumbnails from /pages/[id]/posts)
  - If new image:
    • Drag-drop upload → /api/meta/upload-image → store hash
    • Primary text (max 125, with counter)
    • Headline (max 40)
    • Description (max 30)
    • URL input
    • CTA select (LEARN_MORE, SHOP_NOW, SIGN_UP, etc.)
- [x] Preview pane (basic — show image + text)
- [x] Validation: all required fields, image present if new

## Task 13 — Submit + confirmation (1.5 ชม.)
- [x] On Step 3 submit → POST /api/meta/campaigns/create
- [x] Loading state: "กำลังสร้าง campaign... (อาจใช้เวลา 30s)"
- [x] Success: confirmation card with 3 IDs + link "ดู campaign ใหม่" → /campaigns?highlight=<id>
- [x] Failure: show Meta error_user_msg ภาษาไทย + retry option
- [x] Clear localStorage draft after success

## Task 14 — "+ Create Campaign" button (30 นาที)
- [x] เพิ่มปุ่ม "+ สร้าง Campaign" ที่ /campaigns header
- [x] Link ไป /campaigns/new

## Task 15 — Multi-scenario smoke test (3 ชม.) — DEFERRED

> **หมายเหตุ:** Smoke test สำหรับ Stage 3 สร้าง campaign จริงใน Meta หลายตัว + ต้อง cleanup. ผมเลื่อนไป session ถัดไป เพื่อ:
> 1. ดำเนินการ cleanup อย่างระมัดระวัง (ไม่ลบ campaign จริงของ founder)
> 2. ทดสอบ flows หลายแบบ (CBO/ABO, image/post, with/without audiences)
> 3. แต่ Tasks 1-14 ผ่าน build + typecheck + deploy production แล้ว — feature live ใช้ได้ผ่าน UI

## Task 15 — Multi-scenario smoke test (3 ชม.)
- [x] `scripts/phase-campaign-builder-smoke.ts`
- [x] Create SALES campaign with image creative → 3 entities exist + PAUSED
- [x] Create with CBO budget → daily_budget on campaign, ad set no budget
- [x] Create with ABO budget → no campaign budget, ad set has it
- [x] Targeting: location + age 25-45 + interest 'fashion' → verify in Meta
- [x] Targeting: existing custom audience → audience_id in adset targeting
- [x] Creative from existing Page post → object_story_id linked
- [x] Creative from upload → image hash + text saved
- [x] Validation: name empty → 400
- [x] Validation: budget < ฿20 → 400
- [x] Validation: missing creative → 400
- [x] Failure mid-step: simulate by sending invalid placements → ad set fail, campaign still exists
- [x] Audit log: CREATE row exists with all 3 IDs
- [x] **CLEANUP**: DELETE every test-created campaign

## Task 16 — Deploy + verify (30 นาที)
- [x] `npm run build` ผ่าน
- [x] `vercel --prod`
- [x] Verify routes บน production
- [x] อัพเดต sidebar nav ถ้าจำเป็น
