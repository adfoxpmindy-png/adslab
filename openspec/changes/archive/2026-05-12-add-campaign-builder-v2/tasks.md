# Tasks: add-campaign-builder-v2

Phase 2a + 2b ส่วนใหญ่ shipped ใน session เดียวกัน — defer แค่ multi-image / multi-text / video ไป v3

---

## Phase 2a — Quick UX wins ✅

### Task A1 — Fix page posts cache bug (#6) ✅
- [x] Reset `pagePosts` state เมื่อ `pageId` เปลี่ยน
- [x] ลบ early-return `if (pagePosts.length > 0)` ที่ block re-fetch

### Task A2 — Objective 2-tier picker (#1) ✅
- [x] ลบ emoji ออก ใช้ Lucide icons
- [x] เพิ่ม sub-optimization options ต่อ main (Meta optimization_goal mapping)
- [x] UI: main objective grid 3×2 → click → reveal sub-options
- [x] State: เพิ่ม `optimizationGoal` แทน hardcoded DEFAULT_OPTIMIZATION

### Task A3 — Budget daily/lifetime toggle (#2) ✅
- [x] เพิ่ม budget type radio (daily / lifetime)
- [x] ถ้า lifetime: บังคับใส่ start_time + end_time
- [x] ส่ง `dailyBudget` หรือ `lifetimeBudget` ตามที่เลือก

### Task A4 — Page picker compact + search (#3) ✅
- [x] เพิ่ม search input
- [x] Filter pages by name (substring case-insensitive)
- [x] Limit visible cards, scrollable
- [x] Selected page เป็น card เด่น + ปุ่ม "เปลี่ยน"

### Task A5 — Location picker via city search (#5) ✅
- [x] `/api/meta/geo-search` — เรียก Meta `/search?type=adgeolocation`
- [x] UI: search input + autocomplete chips
- [x] Default: Thailand
- [x] Each chip: removable + Include/Exclude toggle

### Task A6 — Deploy + verify ✅
- [x] Typecheck + build pass
- [x] vercel --prod
- [x] Manual check production

---

## Phase 2b — Major features ✅ (most shipped, multi-image/video defer to v3)

### Task B1 — Multi-image upload (#4) — DEFER to v3
- [ ] Allow up to 10 images in single upload
- [ ] Show preview thumbnails (removable)
- [ ] Save hashes as array
> Defer: single image works for 95% of agency use cases. Carousel = separate change.

### Task B2 — Multi-text variations (#4) — DEFER to v3
- [ ] Primary text: 1-5 variations + Advantage+ optimize
- [ ] Headline: 1-5 variations
- [ ] Description: 1-5 variations
> Defer: pairs with Carousel. Need separate proposal.

### Task B3 — Preview modal (#7) ✅
- [x] Mock-up ad in FB feed style (image + text + CTA)
- [x] Show all settings summary (campaign / objective / budget / targeting / page)
- [x] Back to form button
- [x] Support BOTH new image preview AND existing post preview (message + thumbnail)
- [x] Truncate long text safely (JS truncate, not CSS line-clamp — avoid leakage bug)

### Task B4 — Publish ACTIVE option (#8) ✅
- [x] Add `initialStatus: "ACTIVE" | "PAUSED"` to payload + service
- [x] Confirm dialog warns "Meta จะคิดเงินทันที"
- [x] Status applied to Campaign + Ad Set + Ad

### Task B5 — Video format (#9 partial) — DEFER to v3
- [ ] Upload video to `/act_<id>/advideos`
- [ ] Poll for encoding completion
- [ ] Reference video_id in creative

---

## Unplanned: Meta ODAX critical bug fixes ✅

ระหว่างทดสอบ live เจอ Meta API quirks 4 จุดที่ต้องแก้ ไม่ได้อยู่ใน original proposal

### Task X1 — bid_strategy placement bug ✅
- [x] เดิม: ใส่ที่ ad set ทุก case → CBO campaign ถูก Meta reject ว่า "bid_amount missing"
- [x] แก้: `bid_strategy: LOWEST_COST_WITHOUT_CAP` ที่ **campaign level** สำหรับ CBO, **ad set level** สำหรับ ABO
- [x] Verified ด้วย live test (สร้าง campaign จริง 4 ตัวสำเร็จ)

### Task X2 — promoted_object auto-builder ✅
- [x] `buildPromotedObject(objective, optimization, pageId)` — กำหนด field ที่ Meta ต้องการต่อ combination
- [x] CONVERSATIONS → `{ page_id, custom_event_type: MESSAGING_CONVERSATION_STARTED_7D }` (typo singular vs plural ที่ Meta บังคับ)
- [x] POST_ENGAGEMENT / PAGE_LIKES / THRUPLAY → `{ page_id }`
- [x] OUTCOME_ENGAGEMENT objective → ใส่เสมอแม้ optimization = REACH (Meta requires)

### Task X3 — destination_type ใน ad set ✅
- [x] `buildDestinationType(objective, optimization)` — MESSENGER / WEBSITE / ON_PAGE / ON_AD / APP
- [x] Unlocks objective+optimization combos ที่ ODAX เคย reject

### Task X4 — Hide unsupported optimization paths ✅
- [x] ลบ OFFSITE_CONVERSIONS / VALUE จาก SALES options (ต้องการ Pixel — ไม่ build)
- [x] ลบ LEAD_GENERATION จาก LEADS (ต้องการ Lead Form)
- [x] ลบ POST_ENGAGEMENT / PAGE_LIKES (deprecated ใน ODAX)
- [x] เก็บแค่ optimization ที่ verified ใช้ได้ end-to-end

---

## Unplanned: UX fixes from dogfood ✅

### Task X5 — Highlight just-created campaign in /campaigns list ✅
- [x] Redirect URL `?highlight=<internalId>` หลังสร้างสำเร็จ
- [x] Auto-filter ad account ตาม campaign ใหม่
- [x] Auto-scroll ไป row + ring highlight + badge "✨ เพิ่งสร้าง"

### Task X6 — Custom DatePicker (replace browser datetime-local) ✅
- [x] เดือนไทย ("พฤษภาคม") + ปี พ.ศ. (2569)
- [x] วันสัปดาห์ไทย (อา จ อ พ พฤ ศ ส)
- [x] React Portal ที่ document.body — แก้ bug จม Card ที่มี `overflow-hidden`
- [x] Position auto: คำนวณจาก trigger button rect + resize/scroll listeners
- [x] Time picker (hour 00-23 + minute 5-min steps) ใน popup เดียวกัน
- [x] รองรับ `min`/`max` (end ต้อง ≥ start)

### Task X7 — pfbid post ID resolver ✅
- [x] Accept pfbid... format ใน manual post ID input
- [x] Server-side resolve `GET /<pfbid>?fields=id` → canonical `<pageid>_<postid>`
- [x] Regex match 4 formats: pfbid / `<page>_<post>` / digit-only / facebook.com URL

### Task X8 — Posts fallback (`/promotable_posts` → `/posts`) ✅
- [x] /promotable_posts รองรับเฉพาะ ads-enabled pages
- [x] Try /promotable_posts → fallback /posts → fallback error message
- [x] Surface Meta error เป็นภาษาไทยใน UI

### Task X9 — Age default 20 (Meta TH policy) ✅
- [x] Meta บังคับ age_min ≥ 20 สำหรับ TH targeting
- [x] Default + min validation = 20
- [x] Warning text ใต้ age inputs

---

## Unplanned: Interest targeting (Stage 3 spec ขาด) ✅

### Task X10 — Interest picker with autocomplete ✅
- [x] State: `selectedInterests` array
- [x] InterestPicker component: search input + debounced autocomplete
- [x] Chips with name + audience size estimate
- [x] Map เข้า `targeting.interests` ของ Meta payload
- [x] Show ใน Preview Modal summary

### Task X11 — Meta-style "Suggestions" for seeded interests ✅
- [x] Service `searchInterestSuggestions(tenantId, seedNames)` ใช้ Meta `/search?type=adinterestsuggestion`
- [x] API endpoint ขยายรองรับ `type=interest-suggestion&seeds=...`
- [x] UI: "💡 ความสนใจที่เกี่ยวข้อง" panel เด้งขึ้นหลังเลือก ≥ 1 interest
- [x] Cache 24 ชม. ด้วย sorted seed list (set equivalence)

---

## Final deploy verification ✅

- [x] Production stable ตลอด session (~15 deploys ระหว่างวัน)
- [x] All code paths typecheck clean
- [x] Build size ไม่ขยายผิดปกติ
- [x] Real Meta campaigns สร้าง + cleanup ได้สำเร็จในการ test

---

## Defer to v3 (`add-campaign-builder-v3`)

1. **Multi-image / Carousel** — Advantage+ Creative shape
2. **Multi-text variations** (1-5 per field)
3. **Video format** — `/advideos` + encoding poll
4. **Radius / custom geo targeting** — lat/lng + radius_km
5. **Pixel selector** — for OFFSITE_CONVERSIONS / VALUE objectives
6. **Lead Form builder** — for LEAD_GENERATION objective
7. **App ID setup** — for APP_INSTALLS objective
8. **Smart compatibility filter** — auto-hide optimization options that don't match selected post (vs current manual gating)
