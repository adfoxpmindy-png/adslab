# Proposal: Add Inline Actions (Stage 1 v3 — actionable AI reports)

**Phase:** 1 (Stage 1 v3 — extends `add-meta-quick-actions` + `add-budget-actions`)
**Status:** Proposed 2026-05-12 — awaiting implementation
**User-visible outcome (1 sentence):** เมื่อ AI report แนะนำให้ pause / resume / แก้ budget / แก้ end date ของ campaign ใด ผู้ใช้กดปุ่มในรายงานได้ทันที — ไม่ต้องเปิดหน้า Campaigns แล้วค้นหา campaign นั้นใหม่

---

## 1. ทำไมต้องมี

หลัง `add-budget-actions` ship — Stage 1 ฝั่ง backend ครบแล้ว (pause / resume / budget / end date) แต่ UX กระโดดยังไม่ raibba:

```
ปัจจุบัน:
  1. อ่าน AI report → "Sales campaign 'Asahi June' ROAS 0.5 → ควร pause"
  2. กลับหน้า Campaigns
  3. ค้นหา "Asahi June" ในรายการ 812 ตัว
  4. กด Pause → confirm

ที่ต้องการ:
  1. อ่าน AI report
  2. เห็น "Sales campaign 'Asahi June' ROAS 0.5 → [ Pause ]" ในรายงานเลย
  3. กดปุ่ม → confirm → จบ
```

**Core insight:** AI report ที่ "อ่านอย่างเดียว" คือ tool รายงาน. AI report ที่ "อ่าน + กดได้" คือ assistant ที่ทำงานให้ — นี่คือ killer feature

---

## 2. Design

### 2.1 ทำไมไม่ parse markdown หาชื่อ campaign

มี 2 ทาง:

| ทาง | ปัญหา |
|---|---|
| **Parse markdown body** หาชื่อ campaign + render ปุ่ม inline | เปราะบางมาก: AI อาจสะกดชื่อต่าง, ใช้ "ดู Asahi" vs ชื่อเต็ม, ตัด emoji ออก ฯลฯ → button ผูกผิด campaign = เสียหาย |
| **Structured output JSON** จาก AI พร้อม markdown report | ชัดเจน: AI ให้ campaign id ตรงๆ + action type + เหตุผล — เรา validate ก่อน render |

เลือก **structured output** เพราะ correctness สำคัญกว่าความเก๋

### 2.2 AI output shape

System prompt เพิ่มกฎ: **หลังรายงาน markdown ตามปกติ, ใส่ fenced JSON code block ชื่อ `suggested-actions`:**

````
```json suggested-actions
{
  "actions": [
    {
      "metaCampaignId": "23845...",
      "action": "PAUSE",
      "reason": "Sales ROAS 0.5x vs เป้า 2.5x — funnel น่าจะเสีย"
    },
    {
      "metaCampaignId": "23846...",
      "action": "SET_BUDGET",
      "params": { "dailyBudget": 800 },
      "reason": "CPM ต่ำ + CTR ดี — เพิ่ม budget +30%"
    }
  ]
}
```
````

- AI ออก JSON เฉพาะเมื่อมั่นใจ — ไม่บังคับ
- เรา parse + validate ทุก action ก่อน render

### 2.3 Validation pipeline

```
AI markdown ← parse fenced "suggested-actions" block ← Zod validate ←
  ├ check metaCampaignId มีอยู่ในของ tenant นี้
  ├ check action ∈ {PAUSE, RESUME, SET_BUDGET, SET_END_DATE}
  ├ check SET_BUDGET → CBO only
  ├ check SET_END_DATE → endTime > now
  └ drop invalid → log warning, keep valid → store in DailyReport.suggestedActions Json
```

ถ้า invalid: drop silently (ไม่ break รายงาน). Console log สำหรับ debug

### 2.4 Schema

- **Modified:** `DailyReport.suggestedActions Json?` — stored as array `[{ campaignId, action, params?, reason, status }]`
  - `status` enum: `"pending" | "applied" | "dismissed"` — tracks user interaction
- ไม่ต้องสร้าง table ใหม่ — ผูกกับ report row อยู่แล้ว

### 2.5 UI: Actions panel ในหน้า report viewer

ที่หัวรายงาน เหนือ markdown body:

```
🎯 AI แนะนำให้ทำ (3 actions)
─────────────────────────────────────────────────
⏸ Pause     "Sales — Asahi June 0.5x ROAS"        [ Pause ] [ ข้าม ]
            funnel น่าจะเสีย

💰 +Budget  "Awareness — FROST Reach ฿8 CPM"      [ ปรับเป็น ฿800 ] [ ข้าม ]
            CPM ต่ำ + CTR ดี — เพิ่ม budget +30%

📅 End      "Engagement — KOL Apr ที่หมดไฟ"        [ End now ] [ ข้าม ]
            no delivery 3 วันแล้ว
─────────────────────────────────────────────────
```

- ปุ่ม [ Action ] เรียก existing `/api/meta/campaign-actions` endpoint
- "ข้าม" mark action เป็น dismissed (UI state)
- หลังกด → action row เปลี่ยนเป็น "✓ ทำแล้ว" / "✗ ไม่สำเร็จ"
- Panel collapse ได้ถ้า user ไม่อยากเห็น

### 2.6 ผูกกับ markdown body

หลัง render markdown ปกติ, **ภายในเอกสาร** เมื่อ AI พูดถึง campaign ใน suggested-actions เราใส่ **anchor link** ที่ scroll ไปหา action panel:

```
[Sales — Asahi June ROAS 0.5x](#action-23845...)
```

ไม่ใช่ปุ่มจริงในเอกสาร — แค่ link หา panel ที่ด้านบน. ลดความสับสนของ markdown body

---

## 3. ทำไม design นี้ (vs alternative)

| Alternative | ทำไมไม่เอา |
|---|---|
| Parse markdown หา campaign mentions + render ปุ่ม inline จริง | เปราะบาง (AI สะกดชื่อต่าง = ปุ่มผูกผิด) + เลือดงาน MD parsing เยอะ |
| Function calling / structured outputs ของ Claude | OpenRouter หลายตัวยังไม่ stable + lock-in กับ provider — fenced JSON ใช้ได้ทุกที่ |
| Streaming actions during AI generation | overcomplicate — รายงานสั้น (~3K tokens) ก็เสร็จใน 30s แล้ว |
| ไม่เก็บ status ใน DB (UI state only) | กดแล้ว refresh หาย — user สับสนว่าทำไปแล้วหรือยัง |
| Panel ที่ "ท้าย" รายงานแทน "หัว" | หา action ยาก, user ต้อง scroll หมด → ใส่หัวให้กดได้ทันที |

---

## 4. Test plan (founder rule: multi-scenario)

**Unit:**
1. Parse valid JSON block from markdown → returns actions array
2. Parse markdown without JSON block → returns empty array (no crash)
3. Parse invalid JSON (typo) → returns empty + console warn
4. Validate action: drop unknown action type
5. Validate action: drop unknown metaCampaignId (not in this tenant)
6. Validate action: drop SET_BUDGET on ABO
7. Validate action: drop SET_END_DATE in past

**Integration (live AI + DB):**
8. Generate report on scope with off-track campaigns → AI emits actions JSON → DailyReport.suggestedActions populated
9. Apply action via UI → /api/meta/campaign-actions → action status changes to "applied"
10. Dismiss action → status changes to "dismissed", panel hides it
11. Refresh page → applied/dismissed actions remain in their state

**E2E:**
12. Re-generate report (different date) → suggestedActions for old report stay; new report gets its own

---

## 5. Out of scope (defer)

- True inline button **within** markdown body (parse + replace) — wait for v4 if real demand
- Bulk apply ("Apply all suggested" button) — risky; user should review each
- Cross-report tracking ("ทำตามคำแนะนำของรายงานเมื่อ 3 วันก่อน") — ดูใน /campaigns/history ได้แล้ว
- AI explains "why" deeper (drill-down) — รายงานพอแล้ว
- Email notification: "AI suggested 3 actions" — เพิ่มตอนใช้ daily flow จริง
