# Proposal: Add Meta Quick Actions — Pause / Resume

**Phase:** 1 (Stage 1 v1 of the broader "AI optimization" arc)
**Status:** Shipped to production 2026-05-12 (v1: Pause + Resume only)
**User-visible outcome (1 sentence):** Media buyer หยุดหรือเปิด campaign ใน AdsLab ได้โดยไม่ต้องเปิด Meta Ads Manager — ทำให้ AI report ที่บอก "Sales campaign นี้ ROAS 0.5x" ตามด้วย action ในที่เดียวกันได้ (เตรียม inline-action ใน report ใน v2)

---

## 1. ทำไมต้องมี (Strategic context)

หลัง `add-campaign-goals` + `add-report-scopes` AI report ฉลาดพอที่จะแนะนำชัดเจน เช่น **"pause Campaign X — ROAS 0.5 vs เป้า 2.5"**. แต่ user ต้องเปิด tab อื่นไป Ads Manager เพื่อกด pause → friction สูง + เสีย context

**Vision:** ผู้ใช้ไม่ต้องออกจาก AdsLab เพื่อจัดการ Meta campaigns. นี่คือ killer feature ที่แยกเราจาก "tool รายงานเฉยๆ"

**ทำไม v1 เป็น Pause/Resume เท่านั้น:**

- เรียก Meta endpoint เดียว (`POST /<campaign_id>` with `status`)
- Reversible อย่างสมบูรณ์ (pause → resume กลับเดิมทุกอย่าง)
- High frequency: feedback จาก dogfood "เห็น ROAS แย่ → อยากกด pause ทันที"
- ไม่ต้องเช็คโครงสร้าง budget (CBO vs adset-level) — defer ไป v2

---

## 2. Design

### Action flow

```
User กดปุ่ม → confirm dialog → POST /api/meta/campaign-actions
   ↓
performCampaignAction():
  1. Verify ownership (campaign.connection.tenantId === user's tenantId)
  2. Idempotency check (already at target status → log + return success no-op)
  3. Refresh access token if near expiry
  4. POST to Meta Graph API
  5. Update MetaCampaign cache (effectiveStatus + configuredStatus)
  6. Invalidate dashboard cache (next visit sees new state)
  7. Audit log (success OR failure — always written)
```

### Schema

- **New:** `CampaignActionLog { id, tenantId, campaignId, metaCampaignId, userId, action enum, beforeStatus, afterStatus, result enum, errorMessage, createdAt }`
- **New enums:** `CampaignActionType { PAUSE, RESUME }`, `CampaignActionResult { SUCCESS, FAILED }`
- Append-only audit. campaignId is FK but kept even if MetaCampaign row deleted (for forensic value)

### Safety rails

| Risk | Mitigation |
|---|---|
| Wrong user pause critical campaign | Confirm dialog + role check (OWNER/MEDIA_BUYER only) + audit trail |
| Meta API failure → UI/DB diverge | Log result=FAILED with error, don't touch local cache |
| Double-click pause = error | Idempotency: if already at target status, return success no-op |
| Stale dashboard after action | `invalidateDashboardCache()` after every successful write |
| Token expired mid-action | `getFreshAccessToken()` refreshes within 24h window |

---

## 3. ทำไม design นี้ (vs alternative)

| Alternative | ทำไมไม่เอา |
|---|---|
| ปุ่ม pause/resume ใน Goals page (existing list) | Goals page = objective assignment; โหลด action ลงไปทำให้สับสน + violates SRP |
| Optimistic UI (เปลี่ยน status ใน UI ก่อน Meta ตอบ) | Meta API ล้มเหลวบ่อย — ต้อง rollback + error toast = ซับซ้อนกว่าค่าที่ได้ |
| Bulk pause (เลือกหลาย campaigns) | Risky for v1 — มาตอน v2 พร้อม preview + summary ก่อน confirm |
| Generic action endpoint (รับ action enum หลายตัว) | OK ถ้าเริ่ม 2 actions, ขยายตอน v2 ค่อยเพิ่ม case |

---

## 4. Test plan (founder rule: multi-scenario)

**Live Meta API + DB test (`scripts/phase-quick-actions-smoke.ts`):**

| # | Scenario | Pass |
|---|---|---|
| 1 | Pause ACTIVE → Meta confirms + DB updated + log row exists | ✓ |
| 2 | Audit log has correct userId + before/after + result=SUCCESS | ✓ |
| 3 | Pause again (idempotency) → new log row, no Meta call | ✓ |
| 4 | Resume → back to ACTIVE | ✓ |
| 5 | Audit log ทั้ง PAUSE + RESUME ปรากฏ | ✓ |
| 6 | Unauth POST → 307 redirect to /login | ✓ |
| 7 | Bad action ("NUKE") → 400 validation | ✓ |

ทั้งหมด 18 assertions, ผ่าน 100%

---

## 5. Stage 1 v2 (post-dogfood)

Defer ถึงจะมี feedback ว่าใช้ v1 พอใจหรือไม่:

- **Daily budget edit** — ต้องเช็ค CBO vs adset-level budget ก่อนปรับ; แสดง "current budget" + slider/input
- **End date** — extend หรือ end now
- **Inline action links ใน AI report** — เมื่อ AI พูดถึง campaign ตามชื่อ ให้ markdown มีปุ่ม "Pause / Resume" embed เลย (ต้อง parse + bind)
- **Action history UI** — `/t/<slug>/campaigns/history` แสดง CampaignActionLog (ตอนนี้เก็บแต่ไม่มี UI ดู)

---

## 6. Out of scope (Stage 2+)

- Duplicate campaign (copy + adjust budget)
- Targeting edit (audience, placement, schedule)
- Full campaign creation from scratch
- Asset (creative) upload + management

เหล่านี้รอ paying customer 5+ รายร้องขอ
