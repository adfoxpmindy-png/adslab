# Tasks: add-unified-dashboard

แต่ละ task ออกแบบให้ใช้เวลา 2-4 ชั่วโมง และ system ยัง deployable หลังจบ task

---

## Task 1 — Schema: MetaInsightCache (2 ชม.)
**Goal:** มี table สำหรับ cache insights data

- [ ] เพิ่ม `MetaInsightCache` model (tenantId, scope, rangePreset, payload Json, fetchedAt, expiresAt)
- [ ] เพิ่ม unique + index ตามที่ proposal ระบุ
- [ ] เพิ่ม relation บน `Tenant` (`insightCaches MetaInsightCache[]`)
- [ ] รัน migration: `npm run db:migrate -- --name add_meta_insight_cache`
- [ ] Verify Prisma Studio เห็น table ใหม่

---

## Task 2 — Insights API wrapper (3-4 ชม.)
**Goal:** typed function ที่ดึง insights จาก Meta + normalize

- [ ] `src/lib/meta/insights.ts` — interface สำหรับ `AggregatedInsights`, `PerAccountInsights`
- [ ] `fetchInsightsBatch(accessToken, accountIds, datePreset)` — 1 call ดึงทั้งหมดผ่าน batch
  - Field: `spend, impressions, clicks, actions, action_values, ctr, cpm, cpc, frequency`
  - Breakdown by date preset
- [ ] `parseConversions(actions)` — รวม fb_pixel_purchase + leads + custom events เป็น "conversions"
- [ ] `parseRoas(action_values, spend)` — คำนวณ ROAS จาก purchase value / spend
- [ ] Unit test (เขียนใน scripts/, ลบหลัง verify): mock response → parse ถูกต้อง

---

## Task 3 — Cache layer (2-3 ชม.)
**Goal:** read-through + stale-while-revalidate cache

- [ ] `src/lib/meta/insights-cache.ts`:
  - `getCached(tenantId, scope, range)` — return `{ payload, fetchedAt, isStale }` หรือ `null`
  - `setCached(tenantId, scope, range, payload, ttlSec)` — upsert + set expiresAt
  - `invalidate(tenantId)` — ลบทั้งหมดของ tenant (ใช้ตอน manual refresh)
- [ ] env: `INSIGHTS_CACHE_TTL_SEC=900` (15 นาที)
- [ ] Stale check: ถ้า `expiresAt < now` แต่ payload ยังอยู่ → return stale + flag `isStale=true`

---

## Task 4 — High-level service (3 ชม.)
**Goal:** function ที่ dashboard เรียก — orchestrate cache + fetch

- [ ] `src/lib/meta/dashboard-service.ts`:
  - `getDashboardData(tenantId, range)` — return `{ summary, perAccount, fetchedAt, isStale }`
  - Logic: ลอง cache ก่อน → ถ้า fresh return; ถ้า stale return + spawn revalidate (non-blocking); ถ้า miss → fetch + cache + return
  - Currency rollup: รวมเฉพาะถ้าทุก account ใช้ currency เดียวกัน; ไม่งั้นแสดงแยก
  - Threshold helper: `gradeCpm(value)` → "red" | "yellow" | "green"; `gradeRoas(value)` → ...

---

## Task 5 — API endpoint (2 ชม.)
**Goal:** REST endpoint ที่ frontend เรียก

- [ ] `GET /api/meta/insights?tenantSlug=<slug>&range=<preset>`:
  - require tenant member
  - validate range against allow-list
  - call `getDashboardData()`
  - return JSON
- [ ] `POST /api/meta/insights/refresh?tenantSlug=<slug>`:
  - require OWNER or MEDIA_BUYER
  - call `invalidate()` + return fresh data

---

## Task 6 — Dashboard page rewrite (4 ชม.)
**Goal:** UI เปลี่ยนจาก placeholder → live data

- [ ] Refactor `src/app/t/[tenantSlug]/dashboard/page.tsx`:
  - Server component: fetch initial data via `getDashboardData()` (server-side, no API round trip)
  - Pass to `<DashboardClient />` as initial state
- [ ] `src/components/tenant/dashboard-client.tsx` (client):
  - DateRangePicker (4 buttons, active state)
  - KPI cards: animate count-up; show delta + period comparison
  - Per-account breakdown table
  - "Last synced X mins ago" + refresh button
  - On range change → fetch from `/api/meta/insights`
- [ ] Skeleton component สำหรับ initial load
- [ ] Empty-state: ถ้า account.length > 0 แต่ spend = 0 → "ยังไม่มี campaign ทำงานในช่วงที่เลือก"

---

## Task 7 — KPI traffic-light badges (2 ชม.)
**Goal:** Red/yellow/green บน CPM และ ROAS

- [ ] `src/components/tenant/kpi-badge.tsx`:
  - prop: `metric: "cpm" | "roas"`, `value: number`
  - Logic:
    - CPM: <50 green, 50-100 yellow, >100 red
    - ROAS: >3 green, 2-3 yellow, <2 red
  - Tone: bg + text color ตาม DESIGN.md (green = emerald, yellow = amber, red = destructive)
- [ ] Render ใน account breakdown table + (อนาคต) ใน campaign table

---

## Task 8 — E2E tests + verify (2 ชม.)
**Goal:** เพิ่ม scenarios ครอบคลุม insights flow

- [ ] `dashboard.range.7d` — GET insights with range=7d → returns summary + accounts shape
- [ ] `dashboard.refresh` — POST refresh → returns fresh data + cache invalidated
- [ ] `dashboard.no-connection` — tenant without Meta connection → fallback to Connect CTA
- [ ] `dashboard.cache-hit` — 2nd call within 15min returns same fetchedAt
- [ ] `dashboard.unauthorized-refresh` — VIEWER role → 403 on refresh
- [ ] Update `scripts/e2e-test.ts` + run on production

---

## Task 9 — Settle UX polish (1-2 ชม.)
**Goal:** Founder feedback iterate

- [ ] Browser test ด้วย 31 ad accounts จริง
- [ ] วัด page load time → optimize ถ้า > 3s
- [ ] Settings page: หลัง connect แล้วโชว์ KPI summary preview เล็กๆ
- [ ] Spot-check Thai labels, formatting (currency, percentage)

---

## Definition of Done

- [ ] Task 1-9 ผ่านครบ
- [ ] Acceptance criteria ใน `proposal.md` ผ่านครบ
- [ ] Founder เปิด `/t/demo/dashboard` แล้วเห็นยอด spend / KPI ของ 31 บัญชีจริงๆ
- [ ] E2E tests รวม (foundation + meta + dashboard) ผ่าน 100%
- [ ] Proposal archive + เพิ่ม spec `openspec/specs/dashboard/spec.md`
