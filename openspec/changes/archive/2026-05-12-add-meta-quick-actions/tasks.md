# Tasks: add-meta-quick-actions (Stage 1 v1)

ทุก task ติ๊ก ✅ แล้ว — feature live ที่ production 2026-05-12

---

## Task 1 — Schema: audit log (45 นาที) ✅ DONE
- [x] เพิ่ม enum `CampaignActionType { PAUSE, RESUME }`
- [x] เพิ่ม enum `CampaignActionResult { SUCCESS, FAILED }`
- [x] เพิ่ม model `CampaignActionLog` — id, tenantId, campaignId, metaCampaignId (denormalized), userId, action, before/afterStatus, result, errorMessage, createdAt
- [x] Indexes: `[tenantId, createdAt]` + `[campaignId]`
- [x] `prisma db push` + regenerate client

## Task 2 — Service: `performCampaignAction()` (2 ชม.) ✅ DONE
- [x] สร้าง `src/lib/meta/campaign-actions.ts`
- [x] Verify ownership (campaign.connection.tenantId === tenantId)
- [x] Idempotency: ถ้า configuredStatus = target → log + return success no-op (ไม่เรียก Meta)
- [x] `getFreshAccessToken()` refresh ถ้าใกล้ expire
- [x] เรียก Meta Graph: `POST /<campaign_id> {status: PAUSED|ACTIVE}`
- [x] Update local `MetaCampaign` cache (effectiveStatus + configuredStatus)
- [x] `invalidateDashboardCache()` — ทำให้ dashboard/reports เห็น status ใหม่
- [x] Audit log — บันทึก success **AND failure** (errorMessage เก็บ)

## Task 3 — REST API (45 นาที) ✅ DONE
- [x] `/api/meta/campaign-actions` POST — Zod schema (campaignId + action enum)
- [x] Role check: OWNER + MEDIA_BUYER เท่านั้น
- [x] Session check: `requireSession()` → 307 redirect ถ้าไม่ login
- [x] HTTP 502 ถ้า Meta API ล้มเหลว (log id ถูก return ด้วยเพื่อ trace)

## Task 4 — UI: Campaigns page (3 ชม.) ✅ DONE
- [x] หน้าใหม่ `/t/[tenantSlug]/campaigns/page.tsx` — server component, fetch campaigns + accounts
- [x] `CampaignsClient` client component (search + filter by status/account)
- [x] Stats bar: รวม / Active / Paused / อื่นๆ
- [x] Group by account, แต่ละ row: status dot + name + status badge + ปุ่ม Pause/Resume
- [x] Confirm dialog ก่อนสั่ง
- [x] `busy` state per row (ไม่ disable ทั้งตาราง)
- [x] Toast: loading → success(2.5s) / error(5s) duration

## Task 5 — Sidebar nav (5 นาที) ✅ DONE
- [x] เพิ่ม "Campaigns" item (Megaphone icon) ระหว่าง Reports + Goals

## Task 6 — Multi-scenario smoke test (1.5 ชม.) ✅ DONE
- [x] `scripts/phase-quick-actions-smoke.ts` — 18 assertions on live Meta API
- [x] Pause ACTIVE → Meta confirms + DB updated + log row exists
- [x] Audit log มี userId + before/after + result=SUCCESS
- [x] Pause ซ้ำ → idempotent, log ใหม่ + ไม่เรียก Meta
- [x] Resume → กลับ ACTIVE + DB updated
- [x] Audit history contains both PAUSE + RESUME
- [x] Unauth (ไม่มี cookie) → 307
- [x] Bad action ("NUKE") → 400 validation

## Task 7 — Deploy + verify (30 นาที) ✅ DONE
- [x] `npm run build` (route /campaigns + /api/meta/campaign-actions ปรากฏ)
- [x] `vercel --prod`
- [x] Verify routes บน production (307 auth redirect = ถูก)
- [x] Kill dev server เพื่อไม่กิน resource ค้าง
