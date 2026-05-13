# Proposal: Add Report Scopes (per-client / per-launch reports)

**Phase:** 1 (post-MVP polish)
**Status:** Shipped to production 2026-05-12
**User-visible outcome (1 sentence):** Media buyer สร้าง "scope" ที่บันทึกชุด ad accounts + campaigns ใดๆ แล้วกดสร้าง AI Daily Report เฉพาะ scope นั้นได้ — ส่งรายงานต่อให้ลูกค้าแต่ละเจ้าได้ตรงประเด็น ไม่ปนกับ workspace ทั้งหมด

---

## 1. ทำไมต้องมี (Founder dogfood feedback)

หลัง `add-campaign-goals` ship แล้ว founder ทดสอบกับ 31 ad accounts ของ agency พบว่า:

- Default AI report รวมทุกบัญชี → **actionable ระดับ workspace** แต่ **ไม่ใช่ระดับลูกค้า**
- ใน agency แต่ละลูกค้าอาจมี 1-3 accounts + หลาย campaigns
- เอารายงาน "ทั้งหมด" ไปคุยกับลูกค้าไม่ได้ — ลูกค้าเห็นข้อมูลของลูกค้าคนอื่นด้วย
- founder mental model: "วันนี้กำลังโฟกัสลูกค้า X — ขอรายงานเฉพาะของ X"

**Core insight:** Agency workflow = filter by client. The full-tenant view is for the operator; the client view is for the deliverable.

---

## 2. Design

### "Scope" = ชุด filter ที่ตั้งชื่อได้

```
Scope ตัวอย่าง:
  "FROST"       → accounts: [act_111, act_222]
  "Asahi Q2"    → campaigns: [c1, c2, c5] (cross-account)
  "ทั้งหมด"      → null scopeId (default; ใช้สำหรับ cron daily)
```

**Granularity = Account + Campaign** (ทั้ง 2 ระดับ). ถ้าทั้งสองว่าง = ทั้ง workspace
**Empty `accountIds` + non-empty `campaignIds`** = filter เฉพาะ campaigns ข้าม account ก็ได้

### Resolution + filtering

1. Dashboard data ดึงจาก Meta ตามปกติ (cache ระดับ tenant ไม่ scope-aware — ประหยัด token + API call)
2. `applyScopeFilter(payload, scope)` ตัด accounts/campaigns + **re-aggregate summary** (ไม่ส่ง total ของ workspace ไปกับ scope payload)
3. AI prompt ได้บรรทัด `🎯 SCOPE: <name>` กำกับ → ห้ามอ้าง campaign นอก scope, เรียกชื่อ scope ใน heading

### Cron behavior (token cost ป้องกัน)

> **Founder rule:** "Cron auto-generate เฉพาะ scope 'ทั้งหมด' — scope อื่นกดเอง ไม่งั้น token bill โป่ง"

Cron ที่ 09:00 BKK ยังสร้าง full-tenant report เหมือนเดิม. Scoped reports เป็น manual-only.

### Data model

- **New:** `ReportScope { id, tenantId, name (unique per tenant), accountIds Json, campaignIds Json, timestamps }`
- **Modified:** `DailyReport.scopeId String?` (FK SetNull); composite unique `[tenantId, reportDate, scopeId]`
- Postgres treats NULL distinct ใน unique → full-tenant cron + scoped reports วันเดียวกันอยู่ร่วมกันได้

---

## 3. ทำไม design นี้ (vs alternative)

| Alternative | ทำไมไม่เอา |
|---|---|
| สร้าง `ScopedDailyReport` แยกอีก table | สอง table ทำงานเดียวกัน — query/UI ต้อง union ทุกที่ |
| Sentinel `scopeId = "FULL"` | ulgly + ผูกกับ string-magic |
| Cron auto-generate ทุก scope | $1.8/วัน × scope count → ไม่ scale; founder veto |

---

## 4. Test plan

**Unit (in `applyScopeFilter`):**
- Account filter ตัด accounts ถูก
- Campaign filter drop accounts ที่ไม่มี match
- Empty filter pass-through
- Re-aggregation ของ summary (ไม่ส่ง total เก่ามาด้วย)

**Integration (live DB + Meta):**
- API CRUD ครบ (POST / PATCH / DELETE / GET)
- Generate scoped report → snapshot มีแค่ accounts ใน scope
- ต่อวันเดียว: scope report + full-tenant report (scopeId=null) อยู่ร่วมกันได้

**E2E:** 17 scenarios ผ่านทั้งหมด (smoke script `scripts/phase-scopes-smoke.ts`)

---

## 5. Out of scope (defer)

- Schedule per-scope (เปิด checkbox "auto-daily" ต่อ scope) — เพิ่มเมื่อ founder ตัดสินใจรับภาระ token เพิ่ม
- Bulk-copy scope จาก Goals page filter — UX polish, ทำเมื่อจำเป็น
- Email per scope — ส่งให้ลูกค้าคนละคน (ตอนนี้ส่งถึง OWNER ของ tenant เท่านั้น)
