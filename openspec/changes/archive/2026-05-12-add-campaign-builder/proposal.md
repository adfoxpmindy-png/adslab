# Proposal: Add Campaign Builder (Stage 3 — create from scratch)

**Phase:** 1 (Stage 3 — final stage of campaign management)
**Status:** Proposed 2026-05-12 — awaiting implementation
**User-visible outcome (1 sentence):** Media buyer สร้าง campaign ใหม่ทั้งหมด (Campaign + Ad Set + Ad พร้อม creative) ใน AdsLab ได้โดยไม่ต้องเปิด Meta Ads Manager — wizard 3 ขั้น guide ทุก field ที่จำเป็น + ปล่อยเป็น PAUSED ปลอดภัย รอ user ตรวจก่อนเปิด

---

## 1. ทำไมต้องมี

หลัง Stage 1+2 ครบ — user **จัดการ + duplicate** campaign ที่มีอยู่ใน AdsLab ได้หมด แต่:

- **สร้างใหม่จากศูนย์ยังต้องเปิด Meta Ads Manager** = friction สลับ tab + UI ภาษาอังกฤษ + 50+ fields ที่งง
- AI report มี suggestion DUPLICATE แต่ไม่มี "CREATE_NEW" → user reproduce winner pattern ในบริบทใหม่ยาก
- Vision หลัก: **user ไม่เคยต้องออกจาก AdsLab** สำหรับ Meta workflow ใดๆ — Stage 3 ปิดวงจร

**Core insight:** Stage 3 = "create from scratch" คือสิ่งสุดท้ายที่ต้องมีก่อน AdsLab จะเป็น "Meta Ads Manager ที่ดีกว่า" สำหรับตลาดไทย — เป็น killer differentiator ที่ recurring SaaS value สูงสุด

---

## 2. Design

### 2.1 Meta API model — 3-level hierarchy

```
Campaign       ← objective, budget (if CBO), special_ad_categories, status
   └── Ad Set  ← targeting (location/age/interests/audiences), placements,
                  schedule, optimization goal, budget (if ABO)
        └── Ad ← creative (image/video + text + URL), CTA, tracking
```

3 endpoints, 3 nested calls:
1. `POST /act_<id>/campaigns` → returns campaign_id
2. `POST /act_<id>/adsets` + campaign_id → returns adset_id
3. `POST /act_<id>/ads` + adset_id + creative → returns ad_id

ทุก entity create เป็น `status=PAUSED` เริ่มต้น user ค่อย review/activate ทีหลัง

### 2.2 User flow — 3-step wizard

```
/t/<slug>/campaigns/new
  ↓
Step 1: Campaign
  - Ad account (เลือก 1 จาก 31)
  - Campaign name
  - Objective (7 options: AWARENESS / ENGAGEMENT / TRAFFIC / LEADS / SALES / APP_PROMOTION / STORE_VISITS)
  - Special ad categories (Housing / Employment / Credit / Social — required for legal)
  - Budget mode: CBO (campaign-level) หรือ ABO (ad-set level)
  - ถ้า CBO: daily หรือ lifetime budget (THB)
  - [Next →]
  ↓
Step 2: Ad Set
  - Ad set name
  - ถ้า ABO: budget (THB, daily หรือ lifetime)
  - Targeting:
    • Location (Thailand default + เมือง/จังหวัด)
    • Age range (default 18-65)
    • Gender (All / Male / Female)
    • Interests (search Meta API)
    • Custom audiences (pick from list ที่ tenant มีใน Meta)
    • Lookalike audiences (pick from list)
  - Placements (Auto / Manual: FB feed / IG feed / Stories / Reels)
  - Schedule (start/end time, BKK timezone)
  - Optimization goal (auto-suggested ตาม objective)
  - [← Back] [Next →]
  ↓
Step 3: Ad + Creative
  - Ad name
  - Identity: เลือก Page ที่จะใช้โพสต์
  - Creative source:
    • Option A: เลือก existing post จาก Page (Meta /me/posts)
    • Option B: สร้างใหม่ — upload image + primary text + headline + description + URL + CTA
  - Preview (basic — ใช้ Meta preview iframe)
  - [← Back] [Publish as PAUSED →]
  ↓
Confirmation
  - แสดง 3 IDs ที่สร้าง + link ไปดูใน Campaigns list
  - Sync to MetaCampaign DB → ปรากฏใน /campaigns ทันที
```

### 2.3 Data model

ไม่ต้อง add table ใหม่ — ทุก campaign ที่สร้างผ่าน wizard จะ sync ลง `MetaCampaign` ตามปกติ.

แต่เพิ่ม:
- `CampaignActionType.CREATE` enum value
- `CampaignActionLog` row เก็บ wizard input ตอนสร้าง (audit + retry-from-draft ภายหลัง)
- Draft state ใน `localStorage` ฝั่ง client (user pause ระหว่างกรอกแล้วกลับมาทีหลังได้)

### 2.4 Custom + Lookalike audience pickers

Stage 3 **อ่านได้อย่างเดียว** — pick จาก list ที่มีใน Meta อยู่แล้ว:
- `GET /act_<id>/customaudiences` → list type=CUSTOM, WEBSITE (pixel), LOOKALIKE
- Cache 1 ชม. ใน MetaAdAccountAudienceCache (table ใหม่ optional)

**สร้างใหม่ → Stage 4 (`add-audience-management`)** เป็นอีก change

### 2.5 Image upload

POST `/act_<id>/adimages` with form-data `bytes` (base64) → returns `images[hash].hash`. ใช้ hash ใน creative.

Limit ฝั่งเรา:
- Image: ≤ 8MB, JPG/PNG, อย่างน้อย 600×600 (Meta ต่ำสุด)
- Video: defer ไปอีก v2 — เริ่มจาก image-only ก่อน

### 2.6 Validation per Meta rules

- Budget min: ฿20/day (Meta global minimum)
- Daily budget max: ฿1,000,000 (sanity check)
- Lifetime budget min: depends on duration × daily min
- Age: 18 ขั้นต่ำ (Meta policy, except specific objectives)
- Special ad cat: forced if location in restricted regions
- Headline ≤ 40 chars, primary text ≤ 125 chars (Meta UI display)
- Required: ทุก step ต้องมี name + objective + targeting + creative

แสดง inline validation ใน wizard step นั้นๆ ก่อน user กด Next

### 2.7 Resilience

- Save draft → localStorage (autosave ทุก 5 วินาที)
- Resume from draft → ถ้า user มีงานค้าง แสดงปุ่ม "Resume draft"
- Submit fail (Meta reject) → แสดง error_user_msg ภาษาไทย + ให้แก้ + retry — ไม่ rollback partial (ถ้า campaign สร้างแล้วแต่ adset fail, อย่า delete campaign อัตโนมัติ; ให้ user เลือกลบ)

---

## 3. ทำไม design นี้ (vs alternative)

| Alternative | ทำไมไม่เอา |
|---|---|
| **Single-page form** (ทุก field ใน 1 หน้า) | UX โหดมาก — 50+ fields ใน 1 หน้า user หาไม่เจอ. Meta เองยังใช้ wizard |
| **Embed Meta's iframe builder** | Meta ไม่มี public iframe API + เสีย brand control + ทำ Thai UX ไม่ได้ |
| **Form generator จาก Meta schema** | Auto-gen UI จาก schema ของ Meta = generic + UX แย่ + ปรับยาก |
| **เริ่ม video ad ใน v1** | Video upload ยุ่งกว่า (chunked upload, validation, encoding) — defer v2 |
| **Pre-fill จาก AI suggestion** ("AI สร้าง campaign ให้") | Cool แต่ scope ใหญ่ + risk สูง (AI สร้างผิดเปลือง budget). อาจมา Stage 5 |

---

## 4. Test plan (founder rule: multi-scenario)

**Live Meta API tests (with cleanup at end):**

| # | Scenario | ต้อง pass |
|---|---|---|
| 1 | Create SALES campaign + ad set + image ad → 3 entities exist in Meta + DB | ✓ |
| 2 | All entities created as PAUSED | ✓ |
| 3 | CBO budget mode → daily_budget set on campaign | ✓ |
| 4 | ABO budget mode → daily_budget set on ad set, campaign no budget | ✓ |
| 5 | Targeting: location + age + gender → reflected in Meta /<adset_id>?fields=targeting | ✓ |
| 6 | Targeting: pick existing custom audience → audience_id ใน targeting | ✓ |
| 7 | Creative from existing Page post → linked correctly | ✓ |
| 8 | Creative from new image upload → image hash + body text saved | ✓ |
| 9 | Validation: budget < ฿20 → 400 with Thai message | ✓ |
| 10 | Validation: missing name → 400 | ✓ |
| 11 | Validation: invalid placement combo (e.g. Reels w/o IG) → 400 | ✓ |
| 12 | Audit log: CREATE row with new IDs in afterValue | ✓ |
| 13 | Post-create sync: MetaCampaign + (new MetaAdSet, MetaAd tables) populated | ✓ |
| 14 | Meta reject mid-wizard (e.g. ad set fail after campaign create) → error shown, no auto-rollback | ✓ |
| 15 | Draft autosave → refresh browser → resume from saved state | ✓ |
| 16 | **CLEANUP**: delete (archive) all test campaigns from Meta + DB | ✓ |

---

## 5. Out of scope (defer)

- **Video ads** — chunked upload, encoding wait — Stage 3 v2
- **Carousel / Collection ads** — multi-image structure — Stage 3 v2
- **Catalog sales** (DPA) — requires product feed setup — Stage 3 v3
- **Dynamic Creative** — A/B testing variants automatically — Stage 3 v3
- **Lead form builder** — Stage 3 v2
- **Custom conversions** — defer to Stage 4
- **Bid strategies** (cost cap, bid cap, ROAS target) — use Meta default in v1
- **A/B test setup** — Stage 5
- **Detailed targeting expansion / Advantage+** — Meta auto-handles, surface in v2
- **Tracking specs / Pixel select per ad** — defer to Stage 4 with audience management
- **Create new custom/lookalike audiences** — Stage 4 (`add-audience-management`)

---

## 6. Next stage (`add-audience-management`)

หลัง Stage 3 ใช้ได้แล้ว Stage 4 จะเพิ่ม:

- สร้าง **Custom Audience** จาก: pixel rule, customer list, engagement
- สร้าง **Lookalike** จาก source audience หรือ Page
- จัดการ **Pixel**: list, install instructions, test events
- **CRUD UI** ที่ `/t/<slug>/audiences`

audiences ที่สร้างใน Stage 4 จะปรากฏใน picker ของ Stage 3 ทันที (read-through cache invalidation)
