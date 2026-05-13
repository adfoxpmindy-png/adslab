# Proposal: Campaign Builder v2 — UX rework + Meta parity

**Phase:** 1 (Stage 3 v2 — first dogfood feedback round)
**Status:** Proposed 2026-05-12 — Phase 2a (must-fix UX), Phase 2b (ad formats)
**User-visible outcome (1 sentence):** Campaign builder ใช้ง่ายและตรงกับ workflow ใน Meta Ads Manager มากขึ้น — objectives เป็น 2 ชั้น (main + sub), budget เลือก daily/lifetime, location ค้นหาเมือง, page picker มี search, มี preview ก่อน publish, รองรับ multi-image + ad formats หลายแบบ

---

## 1. Founder dogfood feedback (จาก v1)

จากการใช้งานจริงครั้งแรก 9 จุดที่ต้องแก้:

| # | Issue | Severity |
|---|---|---|
| 1 | Objective ดูงงๆ — ต้องมี main category + sub-optimization + ไม่ใช้ emoji | High |
| 2 | Budget ต้องเลือก daily vs lifetime | High |
| 3 | Page picker สูงมาก (40+ pages) ดูยาก | High |
| 4 | Upload รูปได้ตัวเดียว / text variation ได้อันเดียว (Meta รองรับ 5+) | Medium |
| 5 | Location เป็น ISO code (TH) — ควรเป็น city search + include/exclude + radius | High |
| 6 | **BUG:** เลือก Page แล้วโพสต์ไม่โหลด (cache early-return ผิด) | Critical |
| 7 | ไม่มี Preview ก่อน submit | High |
| 8 | สร้างเป็น PAUSED เสมอ ไม่มีตัวเลือก Publish ทันที | Medium |
| 9 | Ad format มีแค่ image — ขาด Video / Carousel / Collection | Medium |

---

## 2. Design

### 2.1 Objective: 2-tier picker (#1)

**Tier 1 (Main objective):** การ์ด 6 ใบ ไม่มี emoji ใช้ icon บางๆ
```
Awareness · Traffic · Engagement · Leads · Sales · App Promotion
```

**Tier 2 (Sub-optimization):** ปรากฏหลังเลือก tier 1
แต่ละ main มี options ต่างกัน (Meta API: `optimization_goal`):

| Main | Sub-options |
|---|---|
| Awareness | Reach / Impressions / Video Views |
| Traffic | Link Clicks / Landing Page Views |
| Engagement | Post Engagement / Page Likes / Video Views / Messages |
| Leads | Lead Generation / Messages |
| Sales | Conversions / Value optimization |
| App Promotion | App Installs / App Events |

ตอนนี้ระบบเดิม hardcode optimization_goal ต่อ main → v2 ให้ user เลือก

### 2.2 Budget: daily vs lifetime (#2)

```
Budget [Daily ▼] [฿ ___ ]   หรือ   Budget [Lifetime ▼] [฿ ___ ] + ระยะเวลา __ วัน
```

Lifetime budget ต้องมี `start_time` + `end_time` ใน Meta — UI ต้องบังคับใส่

### 2.3 Page picker (#3)

- Search box ที่ top — type-to-filter (substring match)
- รายการแสดงเฉพาะ filtered (default 12 cards, scrollable)
- Selected page แสดงด้านบนเป็นการ์ดเด่น + ปุ่ม "เปลี่ยน"

### 2.4 Multi-image + multi-text (#4)

Meta's Advantage+ Creative:
- 1-10 images (carousel-style upload)
- 1-5 primary text variants
- 1-5 headline variants
- 1-5 description variants
- Meta auto-test combinations

UI: ภายในส่วน "ข้อความโฆษณา" มีปุ่ม "+ เพิ่ม variation" → ขยาย field

Image upload: drag-drop หลายไฟล์พร้อมกัน → preview thumbnails → ลบทีละรูปได้

### 2.5 Location picker (#5)

แทน ISO code text input ด้วย:
- **Search box**: พิมพ์ "Bangkok", "เชียงใหม่" → เรียก `/search?type=adgeolocation&q=...`
- ผลลัพธ์: countries / regions / cities เป็น chips เลือกได้
- แต่ละ chip มี toggle Include / Exclude
- (v2.5) **Radius targeting**: pin a location + radius km — defer

### 2.6 Fix page posts cache bug (#6)

ใน `campaign-builder-form.tsx`:
```ts
// BUG:
if (pagePosts.length > 0) return; // ← ป้องกัน re-fetch เมื่อเปลี่ยน page

// FIX: reset pagePosts when pageId changes + always re-fetch
```

### 2.7 Preview before submit (#7)

หลังกด "สร้าง Campaign":
- แสดง preview modal:
  - Mock-up ของโฆษณา (image + text + CTA button) — แบบ FB feed
  - สรุป settings: objective, budget, audience, schedule
- ปุ่ม: [แก้ไข] [Publish เป็น PAUSED] [Publish ACTIVE]

### 2.8 Publish-now option (#8)

เพิ่มปุ่มที่ preview modal — ถ้าเลือก "Publish ACTIVE" ระบบจะ:
- สร้าง campaign tree ตาม flow เดิม
- แต่ status_option = `ACTIVE` ทุก level
- เตือนใน confirm dialog ว่า "ad จะ run ทันทีและคิดเงิน"

### 2.9 Ad formats (#9)

**Phase 2a:** Single Image (มีอยู่แล้ว) + Single Video (เพิ่มใหม่)
**Phase 2b (defer):** Carousel (2-10 cards), Collection, Instant Experience

Single Video ต้อง:
- Upload video → `/act_<id>/advideos` (chunked for large files)
- Wait for encoding (poll status)
- Reference video_id in creative

---

## 3. Phase split

แบ่งงานเป็น 2 phases ที่ ship แยกได้:

**Phase 2a — Quick UX wins (~1-2 วัน):**
- Fix #6 (bug)
- #1 Objective 2-tier
- #2 Budget daily/lifetime
- #3 Page picker compact + search
- #5 Location picker (basic city search)

**Phase 2b — Major features (~3-5 วัน):**
- #4 Multi-image + multi-text variations
- #7 Preview modal
- #8 Publish-now option
- #9 Video format (Carousel + Collection defer to v3)

---

## 4. Out of scope (defer to v3)

- Carousel + Collection + Instant Experience formats
- Radius targeting
- Detailed Targeting expansion (Advantage+ Audience)
- Lookalike from current campaign performers
- Stop/start time per ad set (independent of campaign)
- Bid strategies (cost cap, bid cap)
- A/B testing setup
