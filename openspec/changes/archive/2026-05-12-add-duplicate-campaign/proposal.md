# Proposal: Add Duplicate Campaign (Stage 2)

**Phase:** 1 (Stage 2 — extends Stage 1 quick actions)
**Status:** Proposed 2026-05-12 — awaiting implementation
**User-visible outcome (1 sentence):** Media buyer กดปุ่ม "📋 Duplicate" บน winning campaign → ตั้งชื่อ + ปรับ budget → กด save → AdsLab สั่ง Meta deep-copy ทั้ง campaign + ad sets + creatives ออกมาเป็น campaign ใหม่ PAUSED พร้อม launch — ไม่ต้องเปิด Ads Manager

---

## 1. ทำไมต้องมี

หลัง Stage 1 ครบ — media buyer อ่าน AI report เห็น winner ของวันแล้ว flow ปกติคือ:

```
ปัจจุบัน:
  1. เห็น "Boost Reach FROST CPM ฿8 — ตัวที่ดีที่สุด"
  2. คิด: "อยากยิงต่อ + เพิ่ม budget"
  3. เปิด Meta Ads Manager
  4. ค้นหา "Boost Reach FROST"
  5. right-click → Duplicate
  6. ปรับ budget + ชื่อ
  7. กดสร้าง
  → 5-7 นาที + สลับ tab

ที่ต้องการ:
  1. เห็น "Boost Reach FROST" ใน Campaigns page
  2. กด 📋 Duplicate
  3. modal: ชื่อ + budget (preset = original) → กด save
  → 30 วินาที
```

**Core insight:** Stage 2 = เก็บเกี่ยว winner. ถ้าทำให้ duplicate ง่ายมาก, media buyer จะกล้าทดลอง launch ใหม่บ่อยขึ้น → ผลลัพธ์ดีขึ้นโดยรวม

---

## 2. Design

### 2.1 Meta API: `POST /<campaign_id>/copies`

Meta รองรับ deep copy ใน 1 call:

```
POST /v23.0/<campaign_id>/copies
Body:
  deep_copy=true              # copy ad sets + ads
  status_option=PAUSED        # ปลอดภัย ไม่ launch ทันที
  rename_options={"rename_suffix": " - Copy"}
```

Response:
```json
{
  "copied_campaign_id": "23845...",
  "ad_object_ids": [
    { "ad_object_type": "campaign", "old_id": "...", "new_id": "..." },
    { "ad_object_type": "adset", "old_id": "...", "new_id": "..." },
    ...
  ]
}
```

หลัง copy + AdsLab จะเรียก `POST /<new_campaign_id>` เพื่อ:
1. Set custom name (ถ้า user override)
2. Set new budget (ถ้า user override)
3. (status_option=PAUSED ส่งใน copy แล้ว ไม่ต้องตามมาแก้)

### 2.2 User flow

**Trigger:** ปุ่ม "📋 Duplicate" บนแถว campaign ในหน้า Campaigns

**Modal fields:**
- **ชื่อใหม่** — default: `"{original} - Copy"`. Required, max 200 chars
- **Budget** — 3 modes:
  - Same as original (default — กดเสร็จเลย)
  - Multiplier (×1.5, ×2, ×0.5) — เร็วสำหรับ "scale winner"
  - Absolute (THB) — แก้ตรงๆ
- **Initial status:** PAUSED (default, safer) / ACTIVE (advanced)
- ปุ่ม "Duplicate" → API → toast + refresh + scroll ไปหา campaign ใหม่

### 2.3 Wire เข้า inline-actions ของ AI

Add to `CampaignActionType` enum + extend suggested-actions JSON shape:

```json
{
  "metaCampaignId": "23845...",
  "action": "DUPLICATE",
  "params": {
    "newName": "Boost Reach FROST - Round 2",
    "dailyBudgetMultiplier": 1.5
  },
  "reason": "CPM ฿8 + CTR 2% — winner ต่อยอด +50%"
}
```

AI จะเสนอเฉพาะ winner ที่ ROAS/CPM/CTR เกินเป้า ไม่ใช่ทุก campaign

### 2.4 Schema

- เพิ่ม `CampaignActionType.DUPLICATE`
- ใช้ `CampaignActionLog.afterValue` เก็บ `{ newCampaignId, newName, dailyBudget?, lifetimeBudget?, status }`
- ไม่ต้องสร้าง table ใหม่

### 2.5 API design

**Dedicated endpoint** `POST /api/meta/campaigns/duplicate`:

```ts
Body:
  sourceCampaignId: string          // internal id (cuid)
  newName?: string
  dailyBudget?: number              // THB; mutually exclusive with multiplier
  lifetimeBudget?: number           // THB
  dailyBudgetMultiplier?: number    // alt: 1.5 = +50% of source
  lifetimeBudgetMultiplier?: number
  initialStatus?: "PAUSED" | "ACTIVE"  // default PAUSED

Returns:
  { newCampaignInternalId, newMetaCampaignId, name, status }
```

แยกจาก `campaign-actions` endpoint เพราะ:
- Returns new entity (ต่างจาก action ที่แก้ entity เดิม)
- Multi-step ภายใน (Meta copy → optional rename → optional budget)
- หลังเสร็จต้อง sync + return id เพื่อ redirect/scroll

แต่ยังเก็บ audit log ใน `CampaignActionLog` ตาม pattern เดิม

### 2.6 Post-duplicate sync

หลัง Meta confirm copy:
1. Sync new campaign → upsert MetaCampaign row (มี budget, end_time, status)
2. Invalidate dashboard cache → refresh จะเห็น campaign ใหม่ทันที
3. Audit log: `DUPLICATE` action, afterValue มี newCampaignId

---

## 3. ทำไม design นี้ (vs alternative)

| Alternative | ทำไมไม่เอา |
|---|---|
| Manual copy (เรียก Meta API สร้าง campaign + ad sets + ads แยกกัน) | งานเยอะ + ต้อง handle creative upload + targeting copy เอง — ใช้ deep_copy ของ Meta คุ้มกว่ามาก |
| Reuse `/api/meta/campaign-actions` endpoint สำหรับ DUPLICATE | Endpoint นี้ design ให้ return updated state ของ entity เดิม — duplicate ต้อง return new entity = type mismatch |
| Bulk duplicate (เลือกหลาย campaigns) | Risky for v1 — แต่ละ duplicate ใช้เวลา 5-15s, bulk จะ timeout. Wait until v2 |
| Optimistic UI (แสดง row ใหม่ก่อน Meta ตอบ) | Meta อาจ reject (เช่น account spending limit) — rollback = UX แย่ |
| Allow customizing ad set budgets (ABO mode) | Scope ใหญ่ — ต้อง list ทุก ad set + UI ปรับแต่ละตัว. Defer ถึงมี request จริง |
| Custom rename suffix per duplicate (e.g. " - Round 2") | User พิมพ์ใส่ใน "newName" ได้อยู่แล้ว — UI extra confusing |

---

## 4. Test plan (founder rule: multi-scenario)

**Live Meta API tests:**

| # | Scenario | ต้อง pass |
|---|---|---|
| 1 | Duplicate CBO daily campaign → new campaign exists in Meta + DB | ✓ |
| 2 | Duplicate with `newName` → new campaign has that name | ✓ |
| 3 | Duplicate with `dailyBudget` THB override → new budget = override | ✓ |
| 4 | Duplicate with `dailyBudgetMultiplier: 1.5` → new = original × 1.5 | ✓ |
| 5 | Duplicate with `initialStatus: "PAUSED"` → new is paused | ✓ |
| 6 | Duplicate ABO campaign → succeeds, no budget override possible | ✓ |
| 7 | Duplicate of non-existent campaignId → 404 | ✓ |
| 8 | Validation: ทั้ง dailyBudget + dailyBudgetMultiplier → 400 | ✓ |
| 9 | Audit log: DUPLICATE row created with newCampaignId in afterValue | ✓ |
| 10 | Post-duplicate sync: new MetaCampaign row exists with correct fields | ✓ |
| 11 | Cleanup: delete the test-created campaign (Meta DELETE) | ✓ |

**Integration:**
- AI suggestion `action: DUPLICATE` parses + validates correctly
- Apply suggestion → calls duplicate endpoint → status="applied" with newCampaignId in appliedLogId trail

---

## 5. Out of scope (defer)

- **Bulk duplicate** — UX risk + Meta rate limits
- **Cross-account duplicate** (copy from FROST account to Asahi account) — Meta API supports `target_object_id` but rare use case
- **Customize ad set / ad-level changes during duplicate** — defer until user requests
- **Schedule duplicate** ("duplicate this every Monday") — future automation feature
- **Auto-delete test campaigns** — wait until paying customers when accidents matter
