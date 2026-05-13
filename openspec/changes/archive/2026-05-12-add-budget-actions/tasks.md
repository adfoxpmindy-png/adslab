# Tasks: add-budget-actions (Stage 1 v2)

แต่ละ task ออกแบบให้ใช้เวลา 1-3 ชั่วโมง และ system ยัง deployable หลังจบ task

---

## Task 1 — Schema extension (1 ชม.) ✅
**Goal:** รองรับ action types ใหม่ + เก็บ before/after values

- [x] เพิ่ม enum values: `CampaignActionType { PAUSE, RESUME, SET_BUDGET, SET_END_DATE }` (เพิ่ม 2 ตัวหลัง)
- [x] เพิ่ม `CampaignActionLog.beforeValue Json?` + `afterValue Json?` (เก็บ budget/endTime snapshot)
- [x] เก็บ `beforeStatus` + `afterStatus` ไว้ใน schema (backward compat กับ v1 logs)
- [x] `prisma db push` + regenerate client

## Task 2 — Sync budget + end_time fields (2 ชม.) ✅
**Goal:** เก็บ daily_budget, lifetime_budget, end_time ของแต่ละ campaign เพื่อแสดงค่าปัจจุบัน

- [x] เพิ่ม fields ใน `MetaCampaign` model: `dailyBudget Int?` (minor units), `lifetimeBudget Int?`, `endTime DateTime?`
- [x] แก้ `fetchInsightsForAllAccounts` ดึง fields เหล่านี้จาก Meta API
- [x] อัปเดต `campaign-sync.ts` บันทึก fields เหล่านี้ใน upsert
- [x] Re-sync ครั้งเดียวเพื่อ populate ค่าเดิม (จะเกิดอัตโนมัติตอน next dashboard fetch)

## Task 3 — Detection helper: CBO vs ABO (45 นาที) ✅
- [x] สร้าง `isCboCampaign(campaign)` ใน `src/lib/meta/campaign-actions.ts`
- [x] CBO = มี dailyBudget หรือ lifetimeBudget. ABO = ทั้งสองเป็น null
- [x] (Unit test ทำใน smoke test รวม)

## Task 4 — Extend `performCampaignAction()` (2 ชม.) ✅
- [x] เปลี่ยน type จาก enum เป็น discriminated union
- [x] SET_BUDGET: ตรวจ CBO ก่อน, reject ถ้า ABO พร้อม message ภาษาไทยชัดเจน
- [x] SET_BUDGET: convert THB → minor units (×100), validate ขั้นต่ำ ฿20 / ขั้นสูง ฿1M
- [x] SET_BUDGET: Lock daily/lifetime ตาม mode เดิมของ campaign (ป้องกัน Meta reject)
- [x] SET_BUDGET: POST `/<campaign_id>` with `daily_budget` หรือ `lifetime_budget`
- [x] SET_END_DATE: validate end_time > now, POST with `end_time` (ISO)
- [x] Audit log: บันทึก beforeValue / afterValue เป็น Json snapshot
- [x] Idempotency: short-circuit no-op ทั้ง 4 actions

## Task 5 — Validation Zod schema (45 นาที) ✅
- [x] Discriminated Zod schema 4 variants (PAUSE / RESUME / SET_BUDGET / SET_END_DATE)
- [x] Reject 400 + message ภาษาไทย

## Task 6 — Action history UI (3 ชม.) ✅
- [x] Server component: query CampaignActionLog + join user (name) + join campaign (name)
- [x] Filter UI: action type, user, result (date range = future v3)
- [x] Table: timestamp / actor / action / campaign / before → after / status
- [x] Pagination 30 rows/page (URL state via searchParams)
- [x] Empty state + error state

## Task 7 — Budget/end-date modal บน Campaigns page (2 ชม.) ✅
- [x] เพิ่มปุ่มในแถว: Pause/Resume + Budget + End date + Header link "ดูประวัติ"
- [x] Modal Edit Budget: แสดง current (THB) + input new (auto detect daily vs lifetime mode)
- [x] Modal Edit End Date: แสดง current + quick buttons (End now / +7 / +30 / Custom)
- [x] กรณี ABO: ปุ่ม Budget disabled + tooltip "Budget อยู่ที่ระดับ ad set"

## Task 8 — Multi-scenario smoke test (2 ชม.) ✅
- [x] `scripts/phase-budget-actions-smoke.ts` — 22 assertions
- [x] SET_BUDGET CBO daily → Meta confirms + DB updated + log
- [x] SET_BUDGET idempotency → no-op success
- [x] SET_BUDGET ABO → FAILED with clear Thai message + logId set
- [x] SET_BUDGET cross-mode (daily on lifetime) → FAILED with clear msg
- [x] Validation: budget < ฿20 → 502 + msg "ขั้นต่ำ ฿20"
- [x] Validation: budget > ฿1M → 502 + msg "เพดาน"
- [x] SET_END_DATE future → success
- [x] SET_END_DATE in past → 502
- [x] Audit log: SET_BUDGET has before/after Json; FAILED has errorMessage
- [x] Restore CBO daily budget after test

**Known limitation logged:** Cannot clear end_time once set (Meta API constraint) — defer to v3 if needed

## Task 9 — Deploy + verify (30 นาที) ✅
- [x] `npm run build` ผ่าน (routes `/campaigns` + `/campaigns/history` + API ปรากฏ)
- [x] `vercel --prod` deployed
- [x] Verify routes บน production (307 auth = ถูก)
