# Phase 5 — Event Tracking SDK (PixelYourSite-style)

## Why

Meta Custom Conversions (Phase 4d) ทำ URL matching ฝั่ง Meta ได้ แต่ user feedback
ระบุชัดว่าต้องการของระดับเดียวกับ **PixelYourSite** / **Madgicx** Cloud Tracking:

- Track event แบบไม่ต้องเขียน code event บนเว็บ (click, scroll, form, time)
- Server-side (CAPI) relay เพื่อรอด ad blocker + iOS 14 ATT
- Dynamic parameters (price, currency, product_id)
- Visual rule builder ใน dashboard
- Event log / debug panel เพื่อ verify

Current state: customers ติด Meta Pixel basic code → ใช้ได้แค่ PageView + Custom
Conversion URL rule. ถ้าจะ track AddToCart / Purchase พร้อม value ต้องเขียน
event code เอง (ไม่ realistic สำหรับลูกค้าเอเจนซี่ทั่วไป)

## What Changes

### New: Hosted JS SDK (`adslab-pixel.js`)
- โหลด config (rules) จาก server เรา per tenant
- Auto-fire Meta Pixel events ตาม rules ที่ตั้งไว้
- Triggers: URL pattern, CSS selector click, form submit, scroll %, time on page
- Dynamic params extraction (data-attributes, text content, currency detection)

### New: CAPI Relay Endpoint
- รับ event จาก SDK + browser context → ส่งต่อ Meta Conversions API
- Dedup via event_id (Pixel + CAPI ส่ง event เดียวกัน ห้ามนับซ้ำ)
- Hash PII (email, phone) server-side ก่อนส่ง Meta
- Store ใน DB เพื่อ debug + replay

### New: Event Rule Builder UI (in `/audiences`)
- Tab "Events" ใหม่ (ถัดจาก Custom Conversions)
- Visual builder: trigger type → conditions → fire event
- Test mode: ดู event log จาก domain เป้าหมาย realtime
- Library of presets: WooCommerce, Shopify, generic landing page

### New: Event Log + Debug Panel
- Realtime stream of events from a specific domain/tenant
- Filter by event name, time range
- Inspect payload, dedup status, Meta response

### Changed: Onboarding Flow
- หลังสร้าง Pixel → guide user paste SDK script ใน `<head>` (เหมือนติด Pixel ปกติ
  แต่ของเรา)
- SDK auto-fires standard PageView + matches rules

### Database
- `EventRule` (id, tenantId, name, pixelId, triggerType, conditions, eventName, paramsExtractor, enabled)
- `EventLog` (id, tenantId, ruleId, fired_at, event_name, payload, dedup_key, capi_status, browser_status)
- `CapiAccessToken` (per tenant — Meta requires CAPI to have its own token)

## Impact

**Affected capabilities:**
- `audiences` — new sub-domain `events` for rule definitions
- `meta` integration — new CAPI relay subsystem

**Affected code:**
- New: `src/lib/event-sdk/` — server-side SDK config + relay
- New: `public/adslab-pixel.js` (built artifact) — client SDK
- New: `src/app/api/event-sdk/config/[siteKey]/route.ts` — SDK config endpoint
- New: `src/app/api/event-sdk/capi/route.ts` — event ingestion + Meta relay
- New: `src/components/tenant/events-tab.tsx` — rule builder UI
- Modified: `prisma/schema.prisma` — 3 new models

**Migration:**
- `prisma migrate` add new tables
- Existing Custom Conversions in Phase 4d stay functional (different mechanism, complementary)

**Scope:** Large — estimated 2-3 weeks build (compared to ~1 week for Phase 4)

## Risks

1. **CAPI token management** — Meta requires Access Token with `ads_management`
   scope. Currently we have per-tenant user tokens; CAPI prefers System User tokens
   (long-lived). Need to investigate via Phase 4 connection or generate new.
2. **SDK delivery** — Vercel Edge Network serves `/adslab-pixel.js`. Need versioning
   strategy + cache busting.
3. **PII handling** — CAPI sends user_data (email/phone hashed). Compliance concern;
   needs privacy policy update.
4. **Dedup correctness** — Pixel + CAPI sending same event must dedup via event_id.
   Mis-dedup = inflated/lost conversions.
5. **Madgicx-level features (multi-touch attribution, AI bidder)** are out of scope
   for Phase 5 — those need Phase 6+ separate proposals.

## Out of Scope (Future Phases)

- Multi-touch attribution model (Madgicx-style)
- AI Bidder
- Auto-tagging UTM
- Server-side audience building from event stream
- Webhook ingestion (e.g. Stripe → Purchase event)
- Mobile app SDK
