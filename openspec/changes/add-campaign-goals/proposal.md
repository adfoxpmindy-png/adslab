# Proposal: Add Campaign Goals + KPI Focus (Phase 1, core differentiator)

**Phase:** 1
**Status:** **Stub — waiting on `add-unified-dashboard` to land first**
**User-visible outcome (1 sentence):** Tenant owner กำหนดเป้าหมายของแต่ละ ad account หรือ campaign เอง (เช่น "Primary: ROAS > 3.0, Secondary: Reach > 100k/วัน") และ AdsLab แสดง "On track / Off track" indicator พร้อมข้อมูลที่ต้องเทียบ — AI Optimization (proposal ถัดไป) จะใช้ goals เหล่านี้เพื่อแนะนำการปรับ campaign จริงๆ

---

## 1. ทำไม proposal นี้สำคัญที่สุด

AdsLab vs คู่แข่ง (Madgicx, Revealbot ฝรั่ง):
- คู่แข่งให้ generic KPIs เหมือนกันทุก agency
- AdsLab ให้ **user-defined goals** ที่สะท้อนวิธีคิดของ media buyer ไทย:
  - Agency e-commerce: focus Purchase + ROAS
  - Agency lead-gen (อสังหา / ประกัน): focus Lead + Cost-per-lead
  - Brand campaign: focus Reach + Frequency cap
  - Mixed: 60% ROAS + 40% Reach (priority weight)

โดยที่ goals = "สัญญา" ที่ AI ต้องเข้าใจเพื่อ optimize ได้จริง

---

## 2. ขอบเขต (รายละเอียดเขียนตอน `add-unified-dashboard` landed)

### Concept ขั้นแรก:

**Schema (planned):**
```prisma
model CampaignGoal {
  id          String   @id @default(cuid())
  tenantId    String
  // scope: tenant-wide OR per ad account OR per campaign
  scope       GoalScope  // TENANT | AD_ACCOUNT | CAMPAIGN
  scopeRefId  String?    // null=tenant; act_xxx=account; cmp_xxx=campaign
  name        String     // "Q4 Sales Push"
  primary     Json       // { metric: "roas", op: ">=", value: 3.0, weight: 1.0 }
  secondary   Json?      // [{ metric: "reach", op: ">=", value: 100000, weight: 0.5 }, ...]
  active      Boolean    @default(true)
  ...
}
```

**UI:**
- New Settings tab: "Goals"
- Goal builder: ระบุ metric (dropdown จาก Meta metrics), operator, target value, weight
- Dashboard KPI cards ปรับเป็น **"% of goal" + พร้อม status badge**
- Per-account row: "✅ 87% ของเป้า" หรือ "⚠️ Off track ROAS"

### Out of scope:

- AI auto-suggesting goals (มากับ `add-ai-optimization`)
- Multi-tenant goal templates (Phase 2)
- Historical goal vs actual analytics (Phase 2)

---

## 3. Dependencies

- ✅ `add-mvp-foundation` (done)
- ✅ `add-meta-integration` (done)
- ⏳ `add-unified-dashboard` — ต้อง landed ก่อน เพราะ goals วางอยู่บน insights data layer
- ⏳ Then this proposal expands the dashboard ให้ goal-aware

---

## 4. หมายเหตุ

**ไฟล์นี้คือ stub** — รายละเอียดเต็ม (architecture decisions, tasks, schema) จะเขียนหลัง `add-unified-dashboard` landed
เพราะ design ของ goals ต้องอ้างถึง shape ของ insights data ที่ยังไม่ stable

**Estimated time:** 5-7 วัน (รวม UI + AI integration points)
