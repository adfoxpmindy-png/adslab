# Proposal: Add Budget Actions (Stage 1 v2)

**Phase:** 1 (Stage 1 v2 — extends `add-meta-quick-actions`)
**Status:** Proposed 2026-05-12 — awaiting implementation
**User-visible outcome (1 sentence):** Media buyer แก้ daily budget, lifetime budget, และ end_date ของ campaign ได้ใน AdsLab โดยตรง + ดู action history ทั้งหมดที่เคยทำ — เตรียมพร้อมให้ AI report พูดว่า "เพิ่ม budget +30%" และมีปุ่มกดได้ใน Stage 1 v3

---

## 1. ทำไมต้องมี

หลัง `add-meta-quick-actions` v1 ship (Pause/Resume) — feedback ภายในชัดว่า:

- **Pause** ใช้บ่อยที่สุดจริง แต่บางครั้งไม่ใช่คำตอบ — campaign ที่ ROAS ต่ำลงอาจแค่ต้อง **ลด budget** ไม่ใช่หยุดทั้งหมด
- AI report เริ่มแนะนำตัวเลขชัดเจน ("เพิ่ม +30%", "ลดเหลือ ฿500/day") แต่ไม่มีปุ่มให้กด → user ต้องเปิด Meta Ads Manager → friction
- ลูกค้า agency ของ founder ถามบ่อย: "ทำไมแคมเปญหยุด" — ต้องการ **audit log UI** ที่อ่านได้

**Core insight:** Quick actions ที่ครบ = ปุ่ม pause + ปุ่มปรับ budget + ปุ่มต่ออายุ. นี่คือ 90% ของสิ่งที่ media buyer ทำซ้ำๆ ทุกวันใน Meta Ads Manager

---

## 2. Design

### 2.1 Budget editing — CBO vs Ad-set level

Meta มี 2 budget models:

| Model | Budget อยู่ที่ | v2 รองรับ? |
|---|---|---|
| **Campaign Budget Optimization (CBO)** | Campaign | ✅ Edit ตรงๆ |
| **Ad-set level budget (ABO)** | แต่ละ Ad Set แยก | ⚠️ แสดง message + link ไป Ads Manager (รอ v3) |

**Detection:** Campaign ที่มี `daily_budget` หรือ `lifetime_budget` field = CBO. ที่ไม่มี = ABO.

**Currency:** Meta API ใช้ **minor units** (สตางค์) เช่น budget ฿500 = `50000`. ต้อง convert ใน UI.

**Validation:**
- ขั้นต่ำ: ฿20/day (Meta's THB minimum)
- ขั้นสูง: ฿1,000,000/day (ป้องกัน fat-finger ใส่ผิด — ถ้าจริงต้องการมากกว่า, override ได้)
- Daily vs Lifetime: lock เป็นแบบเดิม (ถ้า campaign ใช้ daily, edit ได้แค่ daily — Meta ไม่ยอมให้สลับ)

### 2.2 End date editing

- Set / extend `end_time` (ISO datetime, BKK timezone)
- Quick options: "End now", "+7 days", "+30 days", "Custom date"
- "End now" = set end_time = now (Meta auto-pauses เมื่อถึง end_time)

### 2.3 Action history UI

หน้าใหม่ `/t/<slug>/campaigns/history` แสดง `CampaignActionLog`:

- Filter: date range / action type / user / result (success/fail)
- แต่ละ row: timestamp, who, what, campaign name (link), before → after, error message (ถ้า fail)
- Pagination 30 rows/page

### 2.4 Schema changes

ขยาย `CampaignActionType` enum + `CampaignActionLog` model:

```
+ enum CampaignActionType { PAUSE, RESUME, SET_BUDGET, SET_END_DATE }
+ CampaignActionLog.beforeValue Json?  // { dailyBudget: 50000, lifetimeBudget: null, endTime: null }
+ CampaignActionLog.afterValue Json?
```

Keep `beforeStatus`/`afterStatus` for pause/resume backward compat — only set when applicable.

### 2.5 Extended `performCampaignAction()`

ปัจจุบันรับแค่ pause/resume. ขยายเป็น:

```ts
type ActionInput =
  | { action: "PAUSE" | "RESUME" }
  | { action: "SET_BUDGET", dailyBudget?: number, lifetimeBudget?: number } // amounts in THB
  | { action: "SET_END_DATE", endTime: Date }
```

- Verify CBO ก่อน SET_BUDGET — ถ้า ABO → return clear error message
- Convert THB → minor units before sending to Meta

---

## 3. ทำไม design นี้ (vs alternative)

| Alternative | ทำไมไม่เอา |
|---|---|
| รองรับ ad-set-level budget ใน v2 ด้วย | ต้องโหลด/sync ad sets ทั้งหมด + UI per-adset — เพิ่ม ~2 วัน. รอจน founder ใช้จริงแล้วเจอความต้องการก่อน |
| ปุ่มเดียวรองรับทุก action ผ่าน modal เลือก | สับสน — กดปุ่ม "Action" แล้วเลือกใน modal ช้ากว่าปุ่มเฉพาะ |
| Action history เป็น tab ใน /campaigns | History มี filter เยอะ + ต้อง pagination → ดีกว่ามีหน้าเอง |
| Optimistic UI สำหรับ budget edit | Meta API บางครั้ง reject budget change (ตัวอย่าง: ระหว่าง bid review) — rollback เป็น UX worst |

---

## 4. Test plan (founder rule: multi-scenario)

**Live Meta API test:**

| # | Scenario | ต้อง pass |
|---|---|---|
| 1 | Edit daily_budget on CBO campaign → Meta confirms + DB updated + log row | ✓ |
| 2 | Edit lifetime_budget — same as above | ✓ |
| 3 | Try SET_BUDGET on ABO campaign → return clear error (no DB write, log result=FAILED) | ✓ |
| 4 | Set end_time = +7 days → Meta confirms + status remains ACTIVE until end_time | ✓ |
| 5 | "End now" → end_time = now, Meta auto-pauses | ✓ |
| 6 | Validation: budget < ฿20 → 400 | ✓ |
| 7 | Validation: budget > ฿1M → 400 (override flag for emergency) | ✓ |
| 8 | Validation: end_time in past → 400 | ✓ |
| 9 | History page: filter by user → only that user's actions | ✓ |
| 10 | History page: filter by result=FAILED → only failures shown with error | ✓ |
| 11 | Concurrent: 2 budget edits ในเวลาเดียวกัน → last-write-wins, both logged | ✓ |

**Unit tests:**
- THB → minor units conversion (and back)
- CBO detection from campaign data
- Validation edge cases

---

## 5. Out of scope (defer to Stage 1 v3 or later)

- Ad-set-level budget editing (รอ ABO sync infrastructure)
- Targeting edit (audience, placement)
- Creative refresh
- Bulk budget edit (เลือกหลาย campaigns)
- "Suggested budget" จาก AI (จะมาใน Stage 2 — AI optimization)
- Slack / Email notification เมื่อ action เกิดขึ้น
