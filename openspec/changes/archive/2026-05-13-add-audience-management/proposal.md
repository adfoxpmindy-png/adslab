# Proposal: Add Audience Management (Stage 4)

**Phase:** 1 (Stage 4 — closes the loop on campaign creation)
**Status:** Proposed 2026-05-12
**User-visible outcome (1 sentence):** Media buyer สร้างและจัดการ Custom Audience / Lookalike / Pixel audiences ใน AdsLab โดยตรง — audiences ที่สร้างใหม่จะปรากฏใน Interest/Audience picker ของ campaign builder ทันที

---

## 1. ทำไมต้องมี

Stage 3 campaign builder ตอนนี้ **อ่าน** audiences จาก Meta ได้ (Custom Audience picker ในตัวเลือกขั้นสูง) แต่ **สร้างใหม่ไม่ได้** — user ต้องเปิด Meta Ads Manager → Audiences → ทำเอง → กลับมา AdsLab

3 audience types ที่ media buyer ใช้ที่สุด:
1. **Customer list** — อัพโหลด list email/เบอร์ลูกค้าเก่า → retarget
2. **Website visitors** (Pixel) — คนเข้าเว็บไม่ซื้อ → retarget
3. **Lookalike** — คนคล้าย customer ที่ดี → expand prospecting

Phase 4 จะ ship 3 ตัวนี้ + UI จัดการครบ

---

## 2. Design

### 2.1 หน้า `/t/<slug>/audiences`

หน้ารวมแสดง audiences ทุก ad account:
- Filter by account
- Filter by type (CUSTOM / WEBSITE / LOOKALIKE / ENGAGEMENT / APP)
- Table แต่ละ row: name + type + size + last updated + actions (delete / view details)
- ปุ่ม "+ สร้าง Audience ใหม่" → modal เลือก type
- Sidebar nav: เพิ่มเมนู "Audiences"

### 2.2 Create Custom Audience — Customer List

**Flow:**
1. User upload CSV (columns: email หรือ phone)
2. AdsLab parse + validate (≥ 100 rows — Meta minimum)
3. **Hash ฝั่ง client ด้วย SHA-256** ก่อนส่งขึ้น server (privacy: raw PII ไม่ผ่าน server เลย)
4. Server เรียก Meta:
   - `POST /act_<id>/customaudiences` สร้าง audience ใหม่ (subtype=CUSTOM, customer_file_source=USER_PROVIDED_ONLY)
   - `POST /<audience_id>/users` ส่ง hashed data ใน batches (max 10k entries/call)
5. Show progress + final audience_id

**Schema PII:** Meta ต้องการ SHA-256 lowercase trimmed values for matching

### 2.3 Create Custom Audience — Website (Pixel)

**Flow:**
1. Pick pixel (จาก list)
2. Pick rule:
   - All website visitors (last 30/60/90/180 days)
   - People who visited specific URL
   - People who triggered specific event (Purchase / AddToCart / ViewContent)
3. AdsLab → `POST /act_<id>/customaudiences` with `rule={...}` JSON

### 2.4 Create Lookalike Audience

**Flow:**
1. Pick source: existing custom audience OR Page
2. Pick country (Thailand default)
3. Pick size: 1% (most similar) / 3% / 5% / 10% (broadest)
4. AdsLab → `POST /act_<id>/customaudiences` with `subtype=LOOKALIKE`, `origin_audience_id` + `lookalike_spec`

### 2.5 Pixel management (lite)

หน้าย่อย `/t/<slug>/audiences/pixels`:
- List ad accounts → list pixels per account
- View pixel install code (copy-paste)
- View recent events (last 24h count by event_name)
- Create new pixel: name + ad account → returns code

Defer ใน v2: test events, server-side conversion API setup

### 2.6 Integration กับ Stage 3 Campaign Builder

Audiences ที่สร้างใหม่:
- Invalidate cache ของ `/api/meta/audiences?metaAccountId=...` ทันที
- ใน Campaign Builder, Custom Audience picker refresh จะเห็น
- AI report จะอ้างถึงได้

### 2.7 Schema

ไม่ต้องสร้าง table ใหม่ — audiences live ใน Meta. เก็บ cache อย่างเดียวใน `MetaInsightCache` (ที่มีอยู่)

อาจเพิ่ม optional `AudienceCreationLog` table เพื่อ audit (who/when/what created) — เหมือน `CampaignActionLog`

---

## 3. ทำไม design นี้ (vs alternative)

| Alternative | ทำไมไม่เอา |
|---|---|
| Sync audiences เข้า `MetaAudience` table ตลอด | Meta audiences เปลี่ยน frequently (auto-refresh based on rules) — cache เร็วๆ ดีกว่า |
| Server-side hash ของ PII | ผิดหลัก privacy — raw email/phone ไม่ควรผ่าน server เลย |
| Single "Audience Wizard" หน้าเดียวทุก type | UX สับสน — แต่ละ type มี fields ต่างกันเยอะ. Modal ต่อ type ดีกว่า |
| Full Pixel installation UI (Tag Manager / GTM integration) | Scope ใหญ่ — phase แรกแค่ "copy code" ก็พอ |
| รองรับ all 8+ audience types ของ Meta ใน v1 | Customer List + Pixel + Lookalike = 90% use case ของ media buyer. รอ feedback |

---

## 4. Phase split

**Phase 4a — Listing + Customer List upload (~3 วัน):**
- `/audiences` page + list view
- Create Custom Audience from CSV upload (client-side hash)
- Delete audience action
- Sidebar nav

**Phase 4b — Lookalike + Website (Pixel) audiences (~3 วัน):**
- Create Lookalike modal
- Create Website audience (Pixel-based)
- Wire to Campaign Builder Pixel selector (unlocks OFFSITE_CONVERSIONS goal)

**Phase 4c — Pixel management (~2 วัน):**
- List + view install code
- Create new pixel
- Show recent events summary

---

## 5. Test plan (founder rule: multi-scenario)

**Customer list:**
- Upload 100 emails (min size) → audience created in Meta
- Upload mixed email + phone → Meta accepts both
- Upload 50 emails → reject before Meta call (below min)
- Hash verification: SHA-256 lowercase trimmed (manually verify a known email)
- Delete after test

**Lookalike:**
- Source = existing custom audience → success
- Source = Page → success
- 1% / 3% / 5% size variations
- Cleanup audiences after test

**Pixel:**
- List existing pixels per ad account
- Create new pixel → confirm in Meta
- View install code matches Meta's

---

## 6. Out of scope (defer to Stage 5)

- Test event tool / Conversion API
- App audiences (mobile-app SDK events)
- Engagement audiences (post engagement, video views as source)
- Audience overlap analysis
- Saved Audience (location + age + interests preset) management
- Audience sharing between ad accounts (cross-account)
- Audience expiration / TTL management
