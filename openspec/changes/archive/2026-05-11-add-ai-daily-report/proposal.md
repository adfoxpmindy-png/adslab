# Proposal: Add AI Daily Report

**Phase:** 1
**Status:** Draft (auto-approved per founder delegation)
**User-visible outcome (1 sentence):** ทุกเช้า 9:00 น. tenant owner ได้รับอีเมลสรุปผลของวันก่อนหน้า — รวมยอด spend, top performers, ปัญหาที่ต้องดู, และคำแนะนำจาก AI Claude — สามารถกด "สร้างรายงานเดี๋ยวนี้" ใน dashboard เพื่อ generate manual ได้ และดู report ย้อนหลังใน `/t/<slug>/reports`

---

## 1. ทำไมต้องมี

- **ขจัด pain point หลัก:** founder/agency ต้องเข้า Meta Ads Manager ทุกเช้า → AdsLab ส่งสรุปให้
- **Wow factor:** ฟีเจอร์เด่นที่ใช้ได้วันแรก
- **Validate ของจริง:** Claude อ่านข้อมูล 31 accounts + เขียนภาษาไทยที่ใช้งานได้จริงไหม
- **Foundation:** report จะกลายเป็น input ให้ `add-ai-optimization` (ที่ตามมา) ใช้สร้าง recommendations

---

## 2. ขอบเขต

### ✅ In scope

**Data:**
- Schema: `DailyReport` table (tenantId, reportDate, status, contentMd, payloadSnapshot, deliveredAt, generatedBy, tokens, cost)
- 1 report ต่อ tenant ต่อวัน (unique on tenantId + reportDate)

**AI generation:**
- Service `generateDailyReport(tenantId, date)`:
  - Fetch insights for `yesterday` (Bangkok timezone) + previous day for comparison
  - Build context: tenant name, accounts list, key metrics, ROAS leaders, ROAS concerns
  - Call `aiChat({ role: "analysis", ... })` → Claude Sonnet (prompt caching เปิด)
  - Parse markdown response → save to DB
- Prompt template ภาษาไทย:
  - Executive summary (3-5 บรรทัด)
  - Top 3 performers (ROAS / efficiency)
  - 3 concerns (high CPM / low ROAS / disabled accounts)
  - Actionable recommendations
- Output ~600-1200 tokens (Thai is denser per character)

**Email delivery:**
- Send report via Resend on successful generation (auto via cron)
- HTML email template with brand styling (DESIGN.md)
- Subject: "AdsLab Daily — {tenant name} — {date}"

**Cron:**
- Vercel cron at `02:00 UTC` (= 09:00 Bangkok)
- Hits `POST /api/cron/daily-report` with `Authorization: Bearer <CRON_SECRET>` header
- Loops all active MetaConnection tenants → generate per tenant
- Idempotent (skip if report already exists for date)

**Manual trigger:**
- `POST /api/reports/generate?tenantSlug=<slug>` — OWNER/MEDIA_BUYER only
- Same generator function; `generatedBy=userId` (vs null for cron)
- Doesn't email by default (manual = preview); flag `?email=true` to also send

**UI:**
- New page `/t/<slug>/reports` — list of recent reports with preview
- New page `/t/<slug>/reports/<reportId>` — single report viewer (rendered markdown)
- "Generate now" button on dashboard top right (OWNER/MEDIA_BUYER)
- Empty state if no reports yet
- Sidebar: enable "Reports" link (currently disabled)

**Cost guardrails:**
- Estimated cost per report: ~$0.01-0.03 (Claude Sonnet, with prompt caching)
- Founder dogfood 31 accounts: ~$0.50-1/วัน → ~$15-30/เดือน
- Track `promptTokens` + `completionTokens` + `estimatedCostUsd` per report
- Future: monthly cost summary in admin dashboard

### ❌ Non-goals

- ❌ Weekly / Monthly reports → Phase 2 (`add-weekly-report`)
- ❌ Per-account drill-down reports → Phase 2
- ❌ Custom prompt templates per tenant → Phase 2
- ❌ PDF export → Phase 2 (`add-export`)
- ❌ Send to LINE / Slack / Telegram → Phase 2 (`add-notification-channels`)
- ❌ Goal-aware report content (depends on `add-campaign-goals`) → after that lands

---

## 3. การตัดสินใจทางสถาปัตยกรรม

| เรื่อง | ตัดสินใจ | เหตุผล |
|--------|---------|---------|
| AI provider | `aiChat({ role: "analysis" })` → Claude Sonnet (default) ผ่าน OpenRouter | คุณภาพภาษาไทย + prompt caching ลด cost ~70% |
| Generation timing | Cron 02:00 UTC (09:00 Bangkok) | morning brief คือ pattern ที่ media buyer ใช้กันจริง |
| Cron auth | `CRON_SECRET` env (random 32 bytes) + `Authorization: Bearer` header | Vercel cron headers สามารถใส่ได้ผ่าน vercel.json |
| Idempotency | Unique constraint `(tenantId, reportDate)` + check before generate | กัน duplicate ถ้า cron retry หรือ user กด generate manual หลัง cron |
| Date handling | Report date = Bangkok timezone "yesterday" ตอน generate time | Insights data ของ Meta ก็อิง timezone ของ account |
| Report format | Markdown (DB) + render เป็น HTML email + dashboard | Markdown ง่ายต่อ AI generate + flexible render |
| Email retry | Single attempt; failures log + `deliveryError` field; future re-send button | MVP ไม่ใช้ queue |
| Report storage | Keep all reports indefinitely | Cost น้อย (small text); historical insight มีค่า |

---

## 4. Schema changes

```prisma
enum DailyReportStatus {
  GENERATING
  COMPLETED
  FAILED
}

model DailyReport {
  id               String   @id @default(cuid())
  tenantId         String
  reportDate       DateTime @db.Date   // yyyy-mm-dd Bangkok time
  status           DailyReportStatus @default(GENERATING)
  contentMd        String?  // null until completed
  payloadSnapshot  Json?    // insights summary at time of generation
  promptTokens     Int      @default(0)
  completionTokens Int      @default(0)
  estimatedCostUsd Float    @default(0)
  deliveredAt      DateTime?
  deliveryError    String?
  generationError  String?
  generatedAt      DateTime @default(now())
  generatedBy      String?  // userId; null for cron

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, reportDate])
  @@index([tenantId, generatedAt])
}
```

ต้อง expose `dailyReports DailyReport[]` บน `Tenant`.

---

## 5. Acceptance criteria

- [ ] Schema migrated; DailyReport table มี proper indexes
- [ ] `POST /api/reports/generate` สร้าง report สำหรับ tenant (รอ ~5-15s)
- [ ] OWNER/MEDIA_BUYER เรียก generate ได้; VIEWER → 403
- [ ] Generate ซ้ำวันเดิม → return existing report (ไม่ generate ใหม่)
- [ ] `/t/<slug>/reports` แสดงรายการ — รวมวันที่, สถานะ, preview line
- [ ] `/t/<slug>/reports/<reportId>` แสดง report เต็มในรูป markdown rendered
- [ ] Email ส่งเมื่อ cron generate (auto) — HTML branded + Thai content
- [ ] "Generate now" button ใน dashboard ใช้งานได้ (OWNER/MEDIA_BUYER)
- [ ] Sidebar "Reports" link เปิดใช้งานได้
- [ ] Vercel cron config ตั้งค่าใน `vercel.json` — `0 2 * * *`
- [ ] Cron auth: hit endpoint โดยไม่มี `Authorization: Bearer <CRON_SECRET>` → 401
- [ ] Cost ต่อ report บันทึก: tokens + USD estimate
- [ ] AI failure (timeout / rate limit) → status FAILED + generationError saved
- [ ] E2E tests +5 scenarios

---

## 6. AI prompt design

```
SYSTEM (cached): You are an expert Thai media buyer assistant. Read Meta
advertising data and produce a daily report in concise, friendly Thai.
Use markdown headings. Tone: peer / colleague, not formal corporate.
Structure:
1. 📊 ภาพรวมวันนี้ (3-5 บรรทัด)
2. 🏆 Top Performers (3 accounts)
3. ⚠️ จุดที่ต้องดู (3 accounts ที่มีปัญหา)
4. 💡 คำแนะนำ (3-5 ข้อ actionable)

USER (per-call): Tenant: {tenantName}
Date: {date}
Compared to previous day...
[insights summary JSON]
[per-account JSON]
```

System prompt is cached → cost-efficient on repeat calls across tenants.

---

## 7. Test plan (founder rule — multiple scenarios)

Code/integration tests:
1. Schema migration on Neon
2. `generateDailyReport` happy path with real insights data
3. Idempotency: 2nd call same day returns existing
4. AI provider failure → status FAILED + error saved
5. Manual trigger by OWNER → 200 + record + no email
6. Manual trigger by VIEWER → 403
7. Cron endpoint without Bearer → 401
8. Cron endpoint with Bearer → loops + processes each tenant
9. Email delivery success path + failure recovery
10. Report viewer page renders markdown correctly
11. Report list page lists recent + paginates (Phase 1: simple slice)
12. Sidebar "Reports" link enabled
13. Generate button hidden for VIEWER
14. Date timezone: report for "yesterday" matches Bangkok-local yesterday
15. E2E suite: scenarios 39-43 (new)

UI tests (browser, founder verifies):
- Click "Generate now" with 31 accounts → see report rendered in <30s
- Email arrives in inbox with proper Thai formatting + dashboard link
- Reports list shows new entry immediately
