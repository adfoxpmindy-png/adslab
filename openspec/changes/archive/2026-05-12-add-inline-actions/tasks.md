# Tasks: add-inline-actions (Stage 1 v3)

แต่ละ task ออกแบบให้ใช้เวลา 1-3 ชั่วโมง และ system ยัง deployable หลังจบ task

---

## Task 1 — Schema: DailyReport.suggestedActions (30 นาที) ✅
- [x] เพิ่ม `DailyReport.suggestedActions Json?`
- [x] Shape: `Array<{ id, internalCampaignId, metaCampaignId, campaignName, action, params?, reason, status, appliedLogId?, errorMessage? }>`
- [x] `prisma db push` + regenerate client

## Task 2 — Update AI prompt (45 นาที) ✅
- [x] เพิ่มกฎใน DAILY_REPORT_SYSTEM_PROMPT พร้อมตัวอย่าง JSON shape
- [x] ระบุห้าม PAUSE campaign ที่ PAUSED อยู่ / RESUME ที่ ACTIVE อยู่
- [x] กฎ params: dailyBudget xor lifetimeBudget, endTime เป็น ISO UTC

## Task 3 — Parser + validator (1.5 ชม.) ✅
- [x] `src/lib/reports/extract-actions.ts` พร้อม `extractActionsBlock` + `stripActionsBlock`
- [x] Regex หา fenced block + heuristic fallback
- [x] Zod discriminated union validation
- [x] DB-level checks: ownership, CBO, status, past time, mode lock
- [x] Generate stable uuid ต่อ suggestion
- [x] Console.warn เมื่อ drop พร้อม reason

## Task 4 — Wire parser เข้า daily-report flow (45 นาที) ✅
- [x] เรียก `extractAndValidateActions` หลัง AI ตอบ
- [x] `stripActionsBlock` ออกจาก markdown ที่แสดงให้ user
- [x] บันทึก `suggestedActions` ลง DailyReport
- [x] Metric: console.log "parsed X, validated Y"

## Task 5 — API: apply / dismiss (45 นาที) ✅
- [x] `/api/reports/suggestion/route.ts` POST
- [x] Dismiss = update status เท่านั้น (no Meta call)
- [x] Apply = เรียก performCampaignAction + อัพเดต status + appliedLogId
- [x] Apply fail = errorMessage set, status คง pending
- [x] 409 ถ้า apply suggestion ที่ใช้แล้ว/ข้ามแล้ว
- [x] Re-fetch suggestedActions เพื่อกัน race condition
- [x] Role check: OWNER + MEDIA_BUYER

## Task 6 — UI: Actions panel (3 ชม.) ✅
- [x] `ReportActionsPanel` client component
- [x] Render หัวรายงาน + Sparkles icon + count pending/applied/dismissed
- [x] Collapsible (เก็บ state in-memory)
- [x] แต่ละ row: icon + campaign name + describeParams + reason + ปุ่ม [Apply] [ข้าม]
- [x] Confirm dialog ก่อน apply
- [x] หลัง apply: badge "ทำแล้ว" + row อยู่ใน applied section
- [x] หลัง dismiss: row เทาๆ + badge "ข้าม"
- [x] Empty state: ไม่ render panel เมื่อไม่มี actions
- [x] Anchor IDs (`#action-<id>`) — link จาก markdown body ทำงานได้

## Task 7 — Anchor links ใน markdown (45 นาที) — DEFERRED
- [ ] ใส่ link จาก mention ใน markdown ไปยัง panel  
  เหตุผล: AI emit ชื่อ campaign แบบไม่ deterministic — auto-link จะ fragile เกินไป
  Panel ที่หัวรายงานเด่นแล้ว user เห็นได้ง่ายอยู่แล้ว

## Task 8 — Multi-scenario smoke test (2 ชม.) ✅
- [x] `scripts/phase-inline-actions-smoke.ts` — 17 assertions
- [x] Unit: extractActionsBlock + heuristic fallback + stripActionsBlock
- [x] Validate: valid PAUSE on ACTIVE → kept
- [x] Drop: unknown metaCampaignId
- [x] Drop: PAUSE on already-PAUSED
- [x] Drop: SET_BUDGET on ABO
- [x] Drop: SET_END_DATE in past
- [x] Mixed: valid + invalid → only valid kept
- [x] Dismiss → status=dismissed
- [x] Apply → status=applied + appliedLogId set
- [x] Apply again → 409
- [x] Apply on dismissed → 409
- [x] Cleanup: restored paused campaign

## Task 9 — Deploy + verify (30 นาที) ✅
- [x] `npm run build` ผ่าน
- [x] `vercel --prod`
- [x] Verify production routes (307 = auth redirect)
