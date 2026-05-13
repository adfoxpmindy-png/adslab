# Proposal: Add Campaign Goals (Campaign-level AI evaluation)

**Phase:** 1
**Status:** Approved (founder confirmed full 4-phase build)
**User-visible outcome (1 sentence):** ทุก Meta campaign ใน AdsLab จะมี **goal** ที่ชัดเจน — มาจาก Meta objective อัตโนมัติ, จาก naming convention, หรือ user ตั้งเอง — และ AI Daily Report จะประเมินผลทุกตัวเลขใน context ของ goal นั้น (ไม่ลงโทษ Awareness ที่ ROAS = 0; flag funnel issue ของ Sales ที่ clicks เยอะแต่ conversion = 0)

---

## 1. ทำไมต้องมี (Founder dogfood feedback)

หลัง `add-ai-daily-report` ship ครั้งแรก founder ทดสอบกับ 31 accounts พบว่า:

- AI ประเมินที่ **account-level** → ผิด เพราะ 1 account มัก run campaigns **หลาย objective ปนกัน**
- AI ใช้ **เกณฑ์เดียวกันทุก account** → ผิด เพราะ KPI ของ Awareness vs Sales ต่างกันคนละโลก
- AI ไม่รู้ **intent ของ user** → ผิด เพราะ ROAS = 0 อาจ "เจตนา" (Awareness campaign) หรือ "ปัญหา" (Sales campaign with broken funnel)

**Core insight:** Campaign-level + goal-aware = truth. Account-level + generic KPI = misleading.

---

## 2. Design philosophy

### "ทุก campaign ต้องมี goal" — แต่ไม่บังคับวิธีสร้าง

User สร้าง campaign **ที่ไหนก็ได้** (Meta Ads Manager บน mobile, desktop, หรืออื่นๆ) — AdsLab sync เข้ามาแล้ว **assign goal** ให้เสมอ ผ่าน 3-layer hierarchy (priority สูง → ต่ำ):

```
Layer 3: MANUAL OVERRIDE
  User กดเลือก goal ของ campaign นั้นใน UI โดยตรง
  ใช้สำหรับ campaign สำคัญที่ต้อง custom KPI + target
                          ↑ fallback
Layer 2: NAMING CONVENTION
  AdsLab parse campaign name หา pattern: [BRAND], [SALES], [ENG], ...
  Tenant กำหนด custom patterns เองได้
                          ↑ fallback
Layer 1: META OBJECTIVE
  ใช้ campaign.objective ที่ Meta ส่งมา (OUTCOME_SALES → SALES, etc.)
  Always available — works out of the box
```

**Why this approach:**
- ไม่บังคับให้ user เลิกใช้ Meta Ads Manager (มี existing 200+ campaigns)
- Most campaigns get correct goal from Layer 1 automatically (zero user action)
- Power users + agencies with conventions get Layer 2 (low-friction discipline)
- Edge cases get Layer 3 (full control where it matters)

---

## 3. ขอบเขต — 4 sub-phases

### ✅ Phase 1a: Foundation + Campaign-level AI (3-4 วัน)
- Schema: `MetaCampaign`, `CampaignGoal`, `GoalObjective`, `GoalKpi`, `GoalSource` enums
- Fetch: nested campaigns + per-campaign insights via `/me/adaccounts?fields=...,campaigns{...,insights{...}}`
- Service: `resolveCampaignGoal()` — Layer 1 only (Meta objective → GoalObjective mapping)
- AI prompt: rewritten to do **campaign-level analysis** instead of account-level
- DailyReport: AI now groups by RESOLVED goal across campaigns, not by Meta objective at account level
- Migration of cached MetaInsightCache (clear all)
- E2E: 5 scenarios

**Outcome:** AI reports become 100x more useful. No UI changes yet, but report quality jumps immediately.

### ✅ Phase 1b: User control UI (2-3 วัน)
- `/t/<slug>/goals` — campaign list page
  - Filter: by ad account, by status (active/paused/all), by goal source (Auto-Meta / Auto-Name / Manual / Unassigned)
  - Search by campaign name
  - Each row: campaign name, account, Meta objective, **resolved goal** + source badge, spend (last 7d)
- Bulk operations: select N campaigns → bulk-assign goal
- Per-campaign override modal:
  - Pick objective (dropdown of GoalObjective)
  - Optional: primary KPI + target
  - Save → Layer 3 takes precedence
- Sidebar "Goals" link enabled

**Outcome:** User can fine-tune the 10-20 campaigns that need special treatment.

### ✅ Phase 1c: Naming conventions (1-2 วัน)
- `NamingConvention` schema
- Default patterns shipped per-tenant:
  - `[BRAND]`, `[BA]`, `[REACH]`, `[AWARENESS]` → AWARENESS
  - `[ENG]`, `[VIDEO]`, `[VV]`, `[POST]` → ENGAGEMENT
  - `[TRAFFIC]`, `[CLICK]`, `[LP]` → TRAFFIC
  - `[LEAD]`, `[LG]`, `[FORM]` → LEADS
  - `[SALES]`, `[CV]`, `[CONV]`, `[ROAS]` → SALES
- `/t/<slug>/goals/conventions` — manage patterns
  - Add custom pattern (regex or substring)
  - Test against existing campaigns (preview which would match)
  - Priority order (first match wins)
- Layer 2 resolver: applied at sync time + report generation

**Outcome:** Convention-driven agencies (like founder's) get automatic correct classification.

### ✅ Phase 1d: Goal targets + on-track tracking (2 วัน)
- `CampaignGoal.primaryTarget` + `secondaryKpis` JSON
- Pacing logic: "ใช้งบไป X% แต่ achieve KPI Y% — on track / off track"
- Dashboard: add "Goal status" column to account table
- Daily Report: AI explicitly mentions "vs target"
- Replace hardcoded red/yellow/green with goal-aware thresholds where set; fall back to defaults where not

**Outcome:** Goal-based monitoring replaces generic KPI thresholds.

### ❌ Non-goals (Phase 2+)

- ❌ Campaign builder UI (creating campaigns through AdsLab) → Phase 2 (`add-campaign-builder`)
- ❌ AI suggests goals automatically based on past performance → Phase 2 (`add-ai-goal-suggest`)
- ❌ Goal templates / multi-tenant convention library → Phase 2
- ❌ A/B test setups within AdsLab → Phase 2

---

## 4. Schema

```prisma
enum GoalObjective {
  AWARENESS      // reach, brand awareness
  ENGAGEMENT     // post engagement, video views, page likes
  TRAFFIC        // link clicks, landing page views
  LEADS          // lead form submissions, messages
  SALES          // purchases, catalog sales, conversions
  APP_PROMOTION  // app installs
  STORE_VISITS   // physical store traffic
}

enum GoalKpi {
  ROAS
  CPM
  CTR
  CPC
  CPL              // cost per lead
  CPA              // cost per action / conversion
  REACH
  FREQUENCY
  CONVERSIONS
  ENGAGEMENT_RATE
}

enum GoalSource {
  AUTO_META       // Layer 1
  AUTO_NAME       // Layer 2
  USER_MANUAL     // Layer 3
  TENANT_DEFAULT  // fallback for new unsynced campaigns
}

model MetaCampaign {
  id               String   @id @default(cuid())
  metaConnectionId String
  metaCampaignId   String   // Meta's campaign id
  metaAccountId    String   // act_xxx (denormalized for filtering)
  name             String
  metaObjective    String?  // raw Meta value, e.g. "OUTCOME_SALES"
  effectiveStatus  String
  configuredStatus String?
  lastFetchedAt    DateTime @default(now())

  connection MetaConnection @relation(fields: [metaConnectionId], references: [id], onDelete: Cascade)
  goal       CampaignGoal?

  @@unique([metaConnectionId, metaCampaignId])
  @@index([metaConnectionId])
  @@index([metaAccountId])
}

model CampaignGoal {
  id               String        @id @default(cuid())
  tenantId         String
  metaCampaignId   String?       @unique  // null = tenant default
  objective        GoalObjective
  primaryKpi       GoalKpi?      // null until user customizes
  primaryTarget    Float?        // e.g. 3.0 for "ROAS >= 3"
  secondaryKpis    Json?         // [{ kpi: "REACH", target: 100000, weight: 0.4 }]
  source           GoalSource
  notes            String?       @db.Text
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  tenant   Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  campaign MetaCampaign? @relation(fields: [metaCampaignId], references: [metaCampaignId])

  @@index([tenantId])
  @@index([source])
}

model NamingConvention {
  id        String        @id @default(cuid())
  tenantId  String
  pattern   String        // case-insensitive substring or /regex/
  isRegex   Boolean       @default(false)
  objective GoalObjective
  priority  Int           @default(0)  // higher = checked first
  createdAt DateTime      @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, pattern])
  @@index([tenantId, priority])
}
```

---

## 5. Architecture decisions

| เรื่อง | ตัดสินใจ | เหตุผล |
|--------|---------|---------|
| Goal resolution order | Manual (L3) > Naming (L2) > Meta objective (L1) | Most specific wins; matches founder's mental model |
| Goal storage | DB row per campaign + nullable for tenant default | Per-campaign override is the killer feature |
| Meta objective mapping | Internal mapping table (e.g. OUTCOME_SALES → SALES) | Insulates AdsLab from Meta API changes |
| Naming pattern syntax | Substring (default) OR regex (`isRegex: true`) | Substring covers 80%, regex for power users |
| Pattern priority | Explicit `priority` field, first match wins | Predictable ordering |
| New campaigns without goals | Created with `source = AUTO_META` from sync | Always have a goal — no "unassigned" state at DB level |
| Sync trigger | On every Meta connection sync (existing endpoint) | No new cron needed for Phase 1 |
| Cache invalidation on goal change | Invalidate `MetaInsightCache` for affected tenant | Ensure next report reflects new goal |
| AI prompt structure | Pass campaigns array with resolved goal per campaign | Single source of truth for evaluation |
| Token budget per report | 50 active campaigns max, sorted by spend desc | Keeps prompt < ~10K tokens; covers > 90% of attention |

---

## 6. Acceptance criteria

- [ ] Schema migrated: MetaCampaign, CampaignGoal, NamingConvention + 3 enums
- [ ] Sync fetches per-campaign insights (not just account aggregate)
- [ ] Every campaign in DB has a resolved goal via Layer 1+2+3 chain
- [ ] AI Daily Report restructured: groups by RESOLVED GOAL, not Meta objective
- [ ] /t/<slug>/goals lists campaigns + supports filter + search + bulk + per-campaign edit
- [ ] /t/<slug>/goals/conventions lets user manage naming patterns
- [ ] Dashboard account table shows resolved goal mix (+ goal status when target set)
- [ ] Goal target (primaryTarget) drives "on track / off track" indicator
- [ ] Changing a goal invalidates report cache for that tenant
- [ ] 8+ new E2E scenarios; full suite passes on production

---

## 7. Test plan (founder rule — multi-scenario)

For each phase:
1. Happy path: data flows end-to-end
2. Empty state: tenant with no campaigns yet
3. Auth: VIEWER can read goals but can't edit; MEDIA_BUYER + OWNER can edit
4. Schema integrity: cascade deletes work; unique constraints prevent duplicates
5. Resolver fallback: campaign without manual override → falls back to convention → falls back to Meta objective
6. Cache invalidation: changing a goal forces stale → refetch
7. AI output quality: report explicitly references goal-aware reasoning

Production verification:
- Founder browser test after each phase ship
- Compare report quality before/after Phase 1a (this is the biggest jump)
- Spot-check 5 random campaigns for correct goal assignment
