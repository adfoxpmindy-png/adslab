# Tasks: add-duplicate-campaign (Stage 2)

แต่ละ task ออกแบบให้ใช้เวลา 1-3 ชั่วโมง

---

## Task 1 — Schema: add DUPLICATE to enum (15 นาที) ✅
- [x] เพิ่ม `CampaignActionType.DUPLICATE`
- [x] `prisma db push` + regenerate client

## Task 2 — Service: `duplicateCampaign()` (2.5 ชม.) ✅
- [x] `src/lib/meta/duplicate-campaign.ts`
- [x] Verify source campaign ownership
- [x] `POST /<source_meta_id>/copies` ใช้ searchParams (form-style) แทน JSON body
- [x] Validate budget overrides ก่อนเรียก Meta (CBO, mode lock, ขั้นต่ำ/สูง, multiplier ≤ 10)
- [x] Always follow-up rename (default `"{original} - Copy"`); follow-up budget if override
- [x] Resilient fetch-back: ลอง full → minimal → skeleton (กัน Meta field-not-exist edge case)
- [x] Audit log + sync MetaCampaign row + invalidate cache

## Task 3 — API: POST /api/meta/campaigns/duplicate (1 ชม.) ✅
- [x] `src/app/api/meta/campaigns/duplicate/route.ts`
- [x] Zod schema + mutual exclusion via `.refine()`
- [x] Role check OWNER + MEDIA_BUYER
- [x] 404 ถ้า source ไม่อยู่ / 502 ถ้า Meta reject

## Task 4 — UI: Duplicate button + modal (3 ชม.) ✅
- [x] ปุ่ม Copy icon บนแถว campaign
- [x] Modal: name + budget mode radio (Same / Multiplier / Absolute)
- [x] Multiplier preset chips ×0.5 ×1 ×1.5 ×2 + manual input
- [x] Initial status radio: PAUSED (default) / ACTIVE
- [x] ABO campaigns: hide budget override + note ภาษาไทย

## Task 5 — Extend inline-actions schema (1.5 ชม.) ✅
- [x] เพิ่ม DUPLICATE ใน Zod discriminated union ของ `extract-actions.ts`
- [x] Validation: drop ถ้า dual override / ABO + budget / mode mismatch
- [x] Update DAILY_REPORT_SYSTEM_PROMPT พร้อมตัวอย่าง JSON
- [x] AI guidance: "เสนอ DUPLICATE เฉพาะ winner ที่ KPI เกินเป้าอย่างน้อย 30%"

## Task 6 — Wire DUPLICATE in apply API (1 ชม.) ✅
- [x] `/api/reports/suggestion` route DUPLICATE → `duplicateCampaign()`
- [x] บันทึก `newCampaignName` ลง suggestion หลัง apply สำเร็จ
- [x] Actions panel: รองรับ icon Copy + label "Duplicate"

## Task 7 — Multi-scenario smoke test (2 ชม.) ✅
- [x] `scripts/phase-duplicate-smoke.ts` — 19 assertions
- [x] Probe-then-validate flow (ทดสอบ candidate หลายตัวเพราะ Meta /copies จำกัด)
- [x] Duplicate no overrides → new campaign in Meta + DB
- [x] Audit log DUPLICATE มี afterValue.newMetaCampaignId
- [x] Custom name → applied
- [x] Absolute dailyBudget → budget ถูก
- [x] Multiplier 1.5 → budget × 1.5 (diff 0)
- [x] Validation: dual override → 400
- [x] Validation: multiplier > 10 → 400
- [x] Unknown source → 404
- [x] AI parse DUPLICATE → kept; apply ผ่าน /api/reports/suggestion → status=applied
- [x] CLEANUP: ลบ test campaigns ทั้งหมดจาก Meta + DB

**Known Meta constraint (documented in proposal):** /copies API rejects many campaigns due to legacy creatives, dev-mode posts, rate limits, missing IG placements. We surface `error_user_msg` ภาษาไทยจาก Meta ตรงๆ ให้ user เข้าใจ

## Task 8 — Deploy + verify (30 นาที) ✅
- [x] `npm run build` ผ่าน (route `/api/meta/campaigns/duplicate` ปรากฏ)
- [x] `vercel --prod`
- [x] Verify production (307 auth redirect)
