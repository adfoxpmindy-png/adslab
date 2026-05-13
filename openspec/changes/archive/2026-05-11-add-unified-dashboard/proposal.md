# Proposal: Add Unified Dashboard (Phase 1, Meta-only)

**Phase:** 1
**Status:** Draft — awaiting founder approval
**User-visible outcome (1 sentence):** เปิด `/t/<slug>/dashboard` แล้วเห็นยอด spend / impressions / clicks / conversions รวมทุก ad account ของ tenant + ตารางต่อ-account แสดง ROAS, top campaigns โดยเลือกช่วงเวลา (Today / Yesterday / 7d / 30d) ได้

---

## 1. ทำไมต้องมี proposal นี้

`add-meta-integration` เชื่อม Meta แล้ว แต่ dashboard ยังเป็น placeholder
นี่คือ **ฟีเจอร์แรกที่ user จะรู้สึกว่า "AdsLab มีประโยชน์"** — เห็นตัวเลขจริงในที่เดียว แทนการเข้า Meta Ads Manager หลายแท็บ

> ⚠️ Out-of-scope ตามนิยาม Phase 1 MVP: AI Daily Report / Optimization Recommendations → จะมาในตัวที่แยก  
> ✅ In-scope: ตัวเลขดิบ + การจัดกลุ่ม + filter เวลา (foundation ที่ AI features จะวางอยู่บน)

---

## 2. ขอบเขตของ change นี้

### ✅ In scope

**Data layer:**
- ใหม่: `src/lib/meta/insights.ts` — Meta Insights API wrapper (fetch summary + breakdown)
- ใหม่: `MetaInsightCache` table — cache JSON ของ insights ต่อ (tenantId, scope, dateRange)
- TTL caching: 15 นาทีสำหรับ live data; เก็บ history ไว้ 90 วัน
- Stale-while-revalidate pattern: เห็นข้อมูลเก่าทันทีแล้ว revalidate ใน background ผ่าน server action

**APIs:**
- `GET /api/meta/insights?tenantSlug=<slug>&range=<preset>&from=<ISO>&to=<ISO>` — return aggregated KPI + per-account breakdown (preset OR custom from/to)
- `POST /api/meta/insights/refresh?tenantSlug=<slug>` — invalidate cache + force refetch (OWNER + MEDIA_BUYER)

**UI (dashboard page):**
- Date range picker: 4 presets (Today / Yesterday / 7d / 30d) **+ custom calendar picker** (founder requested)
- 4 KPI cards: Total Spend / Impressions / Clicks / Conversions พร้อม delta vs previous period
- Account breakdown table: Account name, business, spend (THB + native), CPM, CTR, ROAS, status
- Empty-state ถ้ายังไม่มี active campaigns: "ยังไม่มี campaign ทำงาน — ไปสร้างที่ Meta Ads Manager ก่อน"
- "Last synced X minutes ago" + manual refresh button
- Skeleton loading state ระหว่าง fetch ครั้งแรก (founder feedback)

**Currency handling:**
- รวมยอดเป็น **THB เดียว** ใช้ fixed FX rate ใน env var (`META_FX_USD_THB`, `META_FX_EUR_THB`, etc.)
- ในตาราง per-account แสดง original currency (ไม่แปลง) เพื่อ transparency
- เพิ่ม helper `convertToThb(amount, currency)` ใน `src/lib/meta/fx.ts` พร้อม unit test
- Phase 2 (`add-fx-feed`): ดึงอัตราอัตโนมัติจาก BOT API รายวัน

**KPI Tracker — basic only:**
- Red/yellow/green badge บน CPM (>100 red, 50-100 yellow, <50 green) และ ROAS (<2 red, 2-3 yellow, >3 green)
- เกณฑ์ hardcoded ใน Phase 1 — user-customizable thresholds + goal tracking **ย้ายไป proposal `add-campaign-goals`** (Phase 1 ตัวต่อไป)

### ❌ Non-goals (proposal ถัดไป)

- ❌ AI Daily Report / Optimization Recommendations → `add-ai-daily-report` / `add-ai-optimization`
- ❌ **User-defined campaign goals + KPI focus + goal-vs-actual tracking** → `add-campaign-goals` (Phase 1, ตัวต่อไปทันที — เป็น **core differentiator**)
- ❌ Charts / time-series visualization → Phase 2 (`add-dashboard-charts`)
- ❌ Campaign-level deep view (drill-down per campaign) → Phase 2
- ❌ Export to CSV / PDF / PPT → Phase 2 (`add-export`)
- ❌ Cross-platform aggregation (Google / TikTok) → Phase 2+
- ❌ Real-time push (WebSocket / SSE) → Phase 3
- ❌ Auto-FX rate from BOT API → Phase 2 (`add-fx-feed`)

---

## 3. การตัดสินใจทางสถาปัตยกรรม

| เรื่อง | ตัดสินใจ | เหตุผล |
|--------|---------|---------|
| Caching layer | DB-backed JSON cache (`MetaInsightCache` table) | ไม่ต้องลง Redis; Neon ฟรี; รองรับ historical ได้ด้วย |
| Cache TTL | 15 นาที (configurable ผ่าน env `INSIGHTS_CACHE_TTL_SEC`) | สมดุลระหว่าง freshness + Meta API quota |
| Cache key | `${tenantId}::${scope}::${range}` | scope = "summary" or `act_<id>`; range = preset string |
| Aggregation level | Per-tenant + per-ad-account | Phase 1 ดูภาพรวม + breakdown ต่อ account; campaign-level Phase 2 |
| Currency normalization | รวมเป็น **THB เดียวเสมอ** ผ่าน fixed FX rate ใน env; แสดง native currency ในตาราง per-account | Founder ตัดสินใจ — agency ไทยคิดเงินเป็น THB |
| FX rate source | Fixed env var (`META_FX_USD_THB`, etc.); manual update รายเดือน | Phase 2 ดึงจาก BOT API อัตโนมัติ (`add-fx-feed`) |
| KPI threshold (red/yellow/green) | Hardcode ใน Phase 1 — CPM (>100 red, 50-100 yellow, <50 green), ROAS (<2 red, 2-3 yellow, >3 green) | User-customizable + goal-aware thresholds → `add-campaign-goals` |
| Conversion metric | Purchase + Lead รวม (default) | Founder บอก "Purchase + Lead" — `add-campaign-goals` ปลดล็อค user-defined goals |
| Date range | 4 presets + custom calendar picker (founder requested) | Custom range เพิ่ม flexibility สำหรับงาน reporting |
| Date timezone | Tenant timezone (ใช้ ad account แรก) | Meta insights มี timezone ของ account; aggregate ใช้ตัวที่บ่อยที่สุด |
| API call pattern | 1 batch call: `/me/adaccounts?fields=insights.date_preset(X){...}` | ลดจำนวน Meta API round-trip |

---

## 4. Schema changes

```prisma
model MetaInsightCache {
  id          String   @id @default(cuid())
  tenantId    String
  scope       String   // "summary" | "act_<id>"
  rangePreset String   // "today" | "yesterday" | "last_7d" | "last_30d"
  payload     Json     // insights data
  fetchedAt   DateTime @default(now())
  expiresAt   DateTime

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, scope, rangePreset])
  @@index([tenantId])
  @@index([expiresAt])  // for periodic cleanup
}
```

ต้อง expose `cache` relation บน `Tenant` ใน schema.

---

## 5. Performance / cost estimate

| Item | Number |
|------|--------|
| Meta API calls per dashboard load (cache miss) | 1 batched call |
| Meta API calls per dashboard load (cache hit) | 0 |
| DB queries per dashboard load | 1-3 (cache lookup + tenant + accounts) |
| Cache hit rate (estimate, founder use) | ~80% (refresh every 15 min, dashboard loaded multiple times) |
| OpenRouter cost | ฿0 — ไม่มี AI ในตัวนี้ |

---

## 6. Acceptance criteria

- [ ] `/t/<slug>/dashboard` ที่ connect Meta แล้ว แสดง 4 KPI cards จริงๆ ไม่ใช่ "฿0"
- [ ] Date range picker เปลี่ยน → ตัวเลข update ตามช่วงเวลาที่เลือก
- [ ] Account breakdown table แสดง 31 บัญชีของ founder
- [ ] Cache: load ครั้งแรก ~3-5s; load ซ้ำใน 15 นาที <500ms
- [ ] "Last synced" timestamp แสดงเวลา cache เก็บค่า
- [ ] Manual refresh button → invalidate cache + refetch
- [ ] Skeleton loading state ระหว่าง fetch ครั้งแรก
- [ ] Empty state (ไม่มี active campaign) แสดงข้อความที่ดี ไม่ใช่ "0" ว่างเปล่า
- [ ] Red/yellow/green badge บน CPM และ ROAS ปรากฏถูกต้องตามเกณฑ์
- [ ] Token expired ระหว่าง fetch → graceful error + ปุ่ม "Reconnect"
- [ ] E2E tests: 5-7 scenarios ใหม่ใน e2e-test.ts

---

## 7. Founder decisions (locked in)

- ✅ **Date range:** 4 presets + **custom calendar picker** (founder request)
- ✅ **Currency:** รวมเป็น **THB เดียว** ผ่าน fixed FX rate ใน env (manual update รายเดือน; auto via BOT API ใน Phase 2)
- ✅ **Conversion metric:** Purchase + Lead รวม (default) — user-defined goals + KPI focus จะมาใน proposal `add-campaign-goals` ต่อทันที

## 8. Pointer to next proposal

หลัง proposal นี้ landed → **`add-campaign-goals`** จะให้ user:
- กำหนด primary + secondary KPIs ต่อ ad account / campaign
- ตั้งเป้า threshold เอง (เช่น "ROAS > 3.0", "Reach > 100k/day")
- เห็น "✅ On track" / "⚠️ Off track" indicator
- ปลดล็อค `add-ai-optimization` (AI ที่รู้ว่าจะ optimize ไปทิศใด)

นี่คือ **core differentiator** ของ AdsLab vs Madgicx — agency ไทยตั้ง goal ภาษาไทยได้ + AI ช่วย optimize ตาม goal ของจริง ไม่ใช่ metric แบบ generic
