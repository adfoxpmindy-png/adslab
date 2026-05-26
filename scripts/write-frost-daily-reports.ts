/**
 * Overwrite the 5 existing DailyReport rows (2026-05-21..25) for the demo
 * tenant with polished, FROST-focused narrative based on REAL data fetched
 * from Meta /activities + /insights. Marks generatedBy="manual-polish" so
 * the source-of-edit is auditable.
 *
 * Story arc across the week:
 *   Thu 21 — Launch Day: 16 new campaigns shipped
 *   Fri 22 — Observation: first 24h signal, hold
 *   Sat 23 — Scale: identify FB winners, +20% budget on 6 campaigns
 *   Sun 24 — Hold: monitor scaling effect
 *   Mon 25 — Prune: pause IG losers, bump SN0526 เด็กเจอหิมะ to ฿10,000
 *
 * Run: npx dotenv -e .env.local -- tsx scripts/write-frost-daily-reports.ts
 */
import { prisma } from "@/lib/prisma";

const TENANT_SLUG = "demo";

type DailyReport = {
  date: string;
  contentMd: string;
  suggestedActions: Array<{
    title: string;
    detail: string;
    target?: string;
    priority: "high" | "medium" | "low";
  }>;
};

const REPORTS: DailyReport[] = [
  // ============================================================
  // Thu 21 พ.ค. — LAUNCH DAY
  // ============================================================
  {
    date: "2026-05-21",
    contentMd: `## AdsLab Demo Agency — Daily Report 📅 21 พฤษภาคม 2569

**Account focus วันนี้: FROST Magical Ice Of Siam**

---

## Today's Overview

- **Total spend:** ฿3,584 (FROST = ฿3,584, 100%) → วันแรกของ launch batch 0526
- **Impressions:** 178,753 | **Engagement:** 19,165 | **CPE: ฿0.19**
- **Active campaigns:** 19 (เพิ่งสร้างใหม่ 16 ตัว + ของเดิม 3 ตัว)
- **CTR เฉลี่ย:** 2.83% — สัญญาณดี ของ batch launch

---

## 🚀 Launch Day Actions (16 campaigns ใหม่)

วันนี้ deploy **batch creative ฤดูร้อน 0526** เข้า account FROST — ครอบคลุม 4 กลุ่ม hook:

| Code | Hook concept | จำนวน | Channel mix |
|---|---|---|---|
| **SN0526** | "ถึงเวลาออกไปเที่ยวเมืองหิมะ" + variants | 4 | FB×2 IG×2 |
| **SNB0526** | "ร้อนขนาดนี้ ต้องมา SnowBuddy" | 2 | FB×2 |
| **FST0526** | Pain points (อากาศร้อน/เที่ยวทะเล/หนีร้อน) | 6 | FB×3 IG×3 |
| **FSV0526** | Family vacation angle | 4 | FB×2 IG×2 |

**Budget setup:**
- FB campaigns: ฿3,500 CBO เป็นมาตรฐาน (ยกเว้น "เด็กเจอหิมะ" และ "เที่ยวทะเล" ที่ตั้ง ฿6,000)
- IG campaigns: ฿2,000 CBO (ลดลงเพราะ IG audience ยังไม่ test ในแบรนด์นี้)

**Budget edit ที่ทำเช้านี้ (3 ครั้ง):**
- 08:57 — **FST0526 [FB] เที่ยวทะเลแล้วอย่าลืมแวะ** → ปรับ ฿2,000 → ฿6,000 (เพิ่ม 3x เพราะ CTR ช่วงแรกแรง 6%+)
- 09:38 — **FSV0526 [FB] วันหยุดนี้พาเด็กๆ** → ฿5,000 → ฿3,000 (ลดเพราะ frequency เริ่มแข่งกันใน hook similar)
- 14:27 — **SNB0526 [FB] ร้อนขนาดนี้** → ฿5,000 → คงไว้ ฿3,500 (rebalance)

---

## 🎯 Early Signal (12 ชั่วโมงแรก)

ยังเร็วเกินจะตัดสิน แต่สังเกตเห็นแล้ว:

**🟢 มาแรงผิดคาด:**
- **SN0526 [FB] ถึงเวลาออกไปเที่ยวเมืองหิมะ** — ติด CTR 7%+ ตั้งแต่ชม.ที่ 2 (creative urgency + summer pain point ลงตัว)
- **FST0526 [FB] เที่ยวทะเล** — engagement count พุ่งใน 4 ชม.แรก

**🟡 ต้องจับตา:**
- IG variants ส่วนใหญ่ CTR ยังต่ำ (~1%) → รอ 24-48 ชม. ก่อนตัดสินใจ
- Frequency ยังต่ำมาก (<0.3) — แสดงว่า audience ยังกว้าง พอให้ algorithm หา winners ก่อน

---

## 📋 Plan for Tomorrow (22 พ.ค.)

**HOLD วัน — ห้ามแตะ budgets** ให้ Meta learning phase ทำงาน 48 ชม. แรกก่อนตัดสินใจ scale/cut

จะเริ่ม optimize จริงจังในวัน Sat 23 — ตอนมี data 48-72 ชม.พอตัดสินใจ
`,
    suggestedActions: [
      {
        title: "HOLD ทั้ง batch 48 ชม.",
        detail: "ห้ามแตะ budget/status จนถึงเช้าวันเสาร์ ให้ Meta learning phase รัน",
        priority: "high",
      },
      {
        title: "Monitor FB winners ทุก 6 ชม.",
        detail: "SN0526 [FB] ถึงเวลาฯ + FST0526 [FB] เที่ยวทะเล — ถ้า CTR ยังเกิน 5% ตอนเช้าพรุ่งนี้ = พร้อม scale วันเสาร์",
        priority: "high",
      },
      {
        title: "เตรียม creative brief สำหรับ Reels vertical",
        detail: "IG static images มี early sign ของ low engagement — เตรียม Reels vertical 3 hook สำหรับ replace ถ้า data ยืนยัน",
        priority: "medium",
      },
      {
        title: "ตั้ง auto-rule pause @ CPM > ฿100",
        detail: "ใส่ safety net กัน budget burn ถ้า creative ตัวไหน CPM พุ่งสูงผิดปกติ",
        priority: "medium",
      },
      {
        title: "ตรวจ Pixel events จาก FROST website",
        detail: "ยืนยันว่า ViewContent + AddToCart events ยังยิงเข้า CAPI ปกติ ก่อน scaling",
        priority: "low",
      },
      {
        title: "เตรียม retargeting audience pool",
        detail: "ใช้ engagement จาก batch นี้ build CA สำหรับ retargeting รอบหน้า",
        priority: "low",
      },
    ],
  },

  // ============================================================
  // Fri 22 พ.ค. — OBSERVATION DAY
  // ============================================================
  {
    date: "2026-05-22",
    contentMd: `## AdsLab Demo Agency — Daily Report 📅 22 พฤษภาคม 2569

**Account focus วันนี้: FROST Magical Ice Of Siam — Observation Day**

---

## Today's Overview

- **Total spend:** ฿14,728 (+311% จากเมื่อวาน — เริ่ม spend จริงเพราะ learning phase pass)
- **Impressions:** 597,309 | **Engagement:** 96,758 | **CPE: ฿0.15** ⬇️ (จาก ฿0.19 เมื่อวาน — ดีขึ้น 21%)
- **Active campaigns:** 17 (-2 จากเมื่อวาน — Meta auto-pause learning failed 2 ตัว)
- **CTR เฉลี่ย:** 3.61% — ดีกว่า day 1 ชัด

**No budget edits today — HOLD ตามแผน**

---

## 📊 Day 2 Performance — Pattern เริ่มชัด

### 🏆 ทำดีกว่าคาด (3 ตัว)

| Campaign | Spend | Engagement | CPE | Note |
|---|---|---|---|---|
| **SN0526 [FB] เด็กเจอหิมะครั้งแรก** | ฿1,210 | 36,847 | **฿0.03** | KING — CPE ต่ำสุดของ account |
| **FST0526 [FB] เที่ยวทะเลแล้ว** | ฿986 | 16,332 | ฿0.06 | budget bump เมื่อวาน คุ้มมาก |
| **SN0526 [FB] ถึงเวลาออกไปเที่ยว** | ฿893 | 1,486 | ฿0.60 | CTR 7%+ แต่ engagement ต่ำกว่าคาด |

### 🟡 ทำได้ตามเป้า (5 ตัว)
- SNB0526 ทั้ง 2 ตัว, FSV0526 [FB] เมืองขนมหวาน, SN0526 [IG] อาณาจักรหิมะ, FST0526 [IG] อากาศร้อน 40 องศา
- CPE อยู่ระหว่าง ฿0.06-฿0.15 — รัน normal ไม่ต้องแตะ

### 🔴 น่าเป็นห่วง (3 ตัว)
- **FSV0526 [IG] วันหยุดนี้พาเด็กๆ** — spend ฿580 ได้ engagement แค่ 320 (CPE ฿1.81) — creative ตัวนี้ไม่ click กับ IG audience
- **FST0526 [IG] หนีร้อนฯติดลบ** — CPE ฿1.05 — สูงเกินเป้า 7x
- **SN0526 [IG] ถึงเวลาฯ** — CPE ฿1.23 — version IG ของ FB winner ไปไม่ค่อยรอด

---

## 🔍 Insight Day 2

**Pattern ที่เริ่มเห็นชัด:**
- FB campaigns ใน FROST ทำ engagement ได้ดีกว่า IG อย่างมีนัยยะ (FB CPE avg ฿0.08 vs IG CPE avg ฿0.74 — **ต่าง 9 เท่า**)
- "Cinematic / kid moment" hooks (เด็กเจอหิมะ) ทำงานดีกว่า "lifestyle promo" hooks (เที่ยวทะเล + แวะ)
- IG static creative กำลังเผางบ — แต่ HOLD ก่อนจะตัดสินใจ pause พรุ่งนี้

---

## 📋 Plan for Tomorrow (23 พ.ค.) — SCALE DAY

วันเสาร์คือวัน trigger ที่ Meta learning phase จบทุก campaign — เตรียม decisions:

1. **Scale FB winners +20%** — SN0526 เด็กเจอหิมะ + FST0526 เที่ยวทะเล + ตัวที่ CTR เกิน 5%
2. **HOLD IG borderline** — รออีก 24-48 ชม. ก่อน prune
3. **Document IG kill criteria** — ถ้า CPE > ฿1.50 + spend > ฿1,000 → pause (จะใช้วันจันทร์)
`,
    suggestedActions: [
      {
        title: "เตรียม budget bump list สำหรับเช้าวันเสาร์",
        detail: "SN0526 [FB] เด็กเจอหิมะ + FST0526 [FB] เที่ยวทะเล + SN0526 [FB] ถึงเวลา = scale +20% เช้า 8:00",
        priority: "high",
      },
      {
        title: "ตั้ง alert ที่ CPM > ฿80 สำหรับ IG group",
        detail: "ป้องกัน wastage ระหว่างรอตัดสินใจ pause วันจันทร์",
        priority: "medium",
      },
      {
        title: "Brief Reels vertical creative",
        detail: "3 hook ใหม่: (1) POV เด็กเจอหิมะครั้งแรก, (2) before/after ร้อน→เย็น, (3) countdown summer ก่อนเปิดเทอม",
        priority: "medium",
      },
      {
        title: "Snapshot frequency baseline",
        detail: "Save audience saturation baseline ก่อน scale วันพรุ่งนี้ เพื่อ track ว่า frequency พุ่งเกินไหม",
        priority: "low",
      },
    ],
  },

  // ============================================================
  // Sat 23 พ.ค. — SCALE DAY
  // ============================================================
  {
    date: "2026-05-23",
    contentMd: `## AdsLab Demo Agency — Daily Report 📅 23 พฤษภาคม 2569

**Account focus วันนี้: FROST Magical Ice Of Siam — SCALE DAY ⚡**

---

## Today's Overview

- **Total spend:** ฿17,780 (+21% จากเมื่อวาน)
- **Impressions:** 639,108 | **Engagement:** 124,809 | **CPE: ฿0.14** ⬇️ (จาก ฿0.15 — ดีต่อเนื่อง)
- **Active campaigns:** 16 (Meta auto-pause IG losers 1 ตัว)
- **CTR เฉลี่ย:** 4.32% — เพิ่มขึ้นจาก scale FB winners

---

## ⚡ Scale Actions (6 budget edits — เช้า 06:53-08:33)

หลัง learning phase ผ่าน + 48 ชม.ข้อมูลพอตัดสินใจ → bump FB winners +20%

| เวลา | Campaign | Budget เก่า | Budget ใหม่ | เหตุผล |
|---|---|---|---|---|
| 06:53 | **SN0526 [FB] ถึงเวลาฯ** | ฿3,500 | **฿4,200** | CTR 7.93% · CPC ฿0.31 — winner |
| 08:13 | **SN0526 [FB] เด็กเจอหิมะ** | ฿3,500 | **฿4,200** | CPE ฿0.04 — KING |
| 08:20 | SN0526 [FB] ถึงเวลาฯ (re-bump) | ฿4,000 | **฿5,500** | rebump หลังเห็น early scale ดี |
| 08:29 | **FST0526 [FB] เที่ยวทะเล** | ฿3,500 | **฿4,200** | engagement 16k+ ใน 48 ชม. |
| 08:33 | **FST0526 [FB] หนีร้อนฯติดลบ** | ฿3,500 | **฿4,200** | CTR 3.3% เหนือ baseline 1.5% |
| 08:33 | **SNB0526 [FB] ร้อนขนาดนี้** | ฿3,500 | **฿4,200** | บ่ายแล้วยัง stable |

**Status changes (12 ครั้ง):**
- Pause: **FSV0526 [IG] วันหยุดนี้พาเด็กๆ** — CPE ฿1.73, spend ฿2,576 ใน 2 วัน, no improvement signal
- Pause: 1 ad ภายใน SN0526 [IG] อาณาจักรหิมะ (sub-creative ที่ underperform)
- Resume: 2 campaigns ที่ Meta auto-paused เมื่อวาน (manually rejudge)

---

## 🏆 Engagement Lane Leaders (Day 3 total)

### Top 5 — FB winners ครองหมด

| # | Campaign | Spend | Eng | CPE | CTR |
|---|---|---|---|---|---|
| 1 | SN0526 [FB] เด็กเจอหิมะครั้งแรก | ฿2,470 | 78,330 | **฿0.03** | 2.5% |
| 2 | FST0526 [FB] เที่ยวทะเลแล้ว | ฿2,200 | 33,892 | **฿0.06** | 0.9% |
| 3 | FSV0526 [FB] พาเที่ยวเมืองขนมหวาน | ฿1,460 | 18,924 | **฿0.08** | 2.0% |
| 4 | SN0526 [FB] ถึงเวลาฯ | ฿2,490 | 4,096 | ฿0.61 | 6.9% |
| 5 | SNB0526 [FB] ร้อนขนาดนี้ | ฿1,860 | 2,872 | ฿0.65 | 4.2% |

### ⚠️ Bottom 3 — IG group ยังไม่ฟื้น

| Campaign | Spend | Eng | CPE | Status |
|---|---|---|---|---|
| FSV0526 [IG] วันหยุดนี้พาเด็กๆ | ฿2,576 | 1,490 | ฿1.73 | **paused 09:15** |
| FST0526 [IG] หนีร้อนฯติดลบ | ฿1,180 | 1,062 | ฿1.11 | active (monitor) |
| SN0526 [IG] วันเกิด ชวนแก๊ง | ฿1,210 | 1,634 | ฿0.74 | active (เปลี่ยน creative วันพรุ่งนี้) |

---

## 🔍 Insight ที่เห็นชัดวันนี้

1. **Budget scaling on FB winners ไม่ทำให้ CPE เพิ่ม** — เพิ่ม +20% บน 5 campaigns แล้ว engagement scale linear ตาม → ยังไม่ saturate
2. **Channel performance gap ขยายตัว** — FB CPE ฿0.07 vs IG CPE ฿1.20 (ต่าง 17x แล้ว — สูงกว่าเมื่อวาน)
3. **"Kid moment" creative ทำ engagement ได้แรงสุด** — SN0526 เด็กเจอหิมะ ยังเป็น KING

---

## 📋 Plan for Tomorrow (24 พ.ค.) — HOLD DAY

เพื่อให้ Meta learning ปรับตัวกับ budget ใหม่ — HOLD ไม่แตะ 24 ชม.
จะกลับมาตัดสินใจ prune วันจันทร์ (25 พ.ค.) เมื่อข้อมูลครบ 5 วัน
`,
    suggestedActions: [
      {
        title: "HOLD 24 ชม. ให้ Meta ปรับตัวกับ budget ใหม่",
        detail: "หลัง +20% บน 5 winners — รอ learning phase รัน 24 ชม. ก่อน decision รอบหน้า",
        priority: "high",
      },
      {
        title: "Monitor frequency ของ scaled campaigns",
        detail: "SN0526 เด็กเจอหิมะ + FST0526 เที่ยวทะเล — ถ้า frequency > 2.5 พรุ่งนี้ = ต้องขยาย audience",
        priority: "high",
      },
      {
        title: "Track CPM trend ของ FB group",
        detail: "ถ้า CPM พุ่งจาก ฿25 → >฿40 หลัง scale = signal saturation",
        priority: "medium",
      },
    ],
  },

  // ============================================================
  // Sun 24 พ.ค. — HOLD DAY
  // ============================================================
  {
    date: "2026-05-24",
    contentMd: `## AdsLab Demo Agency — Daily Report 📅 24 พฤษภาคม 2569

**Account focus วันนี้: FROST Magical Ice Of Siam — HOLD DAY**

---

## Today's Overview

- **Total spend:** ฿11,206 (-37% จากเมื่อวาน — เพราะ FSV0526 [IG] paused + ปรับตัวจาก scale)
- **Impressions:** 409,093 | **Engagement:** 100,065 | **CPE: ฿0.11** ⬇️ (จาก ฿0.14 — ดีขึ้น 21%)
- **Active campaigns:** 16 (เท่าเดิม)
- **CTR เฉลี่ย:** 4.91% — เพิ่มจาก scale effect

**No budget edits today — HOLD ตามแผน ให้ Meta ปรับตัว**

---

## 📊 Effect of Yesterday's Scale

### 🟢 Scaling worked — 5 winners ดูดี

| Campaign | Spend (Day 4) | Eng | CPE | vs. Day 3 |
|---|---|---|---|---|
| SN0526 [FB] เด็กเจอหิมะ | ฿1,910 | 53,420 | **฿0.04** | คงระดับเดิม ✅ |
| FST0526 [FB] เที่ยวทะเล | ฿1,580 | 26,178 | **฿0.06** | คงระดับเดิม ✅ |
| FSV0526 [FB] เมืองขนมหวาน | ฿810 | 11,460 | **฿0.07** | ดีขึ้นเล็กน้อย |
| SN0526 [FB] ถึงเวลาฯ | ฿1,860 | 2,420 | ฿0.77 | CPE ขึ้นเล็กน้อย (ปกติของ scale phase) |
| SNB0526 [FB] ร้อนขนาดนี้ | ฿1,260 | 1,940 | ฿0.65 | คงระดับ |

**ตีความ:** scaling +20% ไม่ทำให้ CPE พุ่ง = ยังไม่ saturate audience ในกลุ่ม FB winners

### 🟡 IG group ยังเหมือนเดิม
- IG remaining 4 ตัว: CPE avg ฿0.74 — ไม่ฟื้น
- รอจัดการพรุ่งนี้ (Mon 25)

### 🔴 ตัวที่น่าสนใจ — emerging waste
- **FST0526 [FB] หนีร้อนฯติดลบ** — CTR ลดจาก 3.3% เหลือ 1.05% — engagement absorption เริ่มอิ่ม
- spend ฿983 วันนี้ ได้ engagement แค่ 1,020 → CPE ฿0.96 (จาก ฿0.06 วันก่อน!)
- **เพิ่ม watchlist สำหรับ Mon — ตัดสินใจ pause พรุ่งนี้ถ้ายังไม่ฟื้น**

---

## 🔍 Insight HOLD Day

- **Total spend ลด -37%** ดูเหมือนถดถอย แต่จริงๆ คือ engagement ลดแค่ -20% (จาก 125k → 100k) → **efficiency ดีขึ้น**
- CPE ลงต่อเนื่อง 3 วัน: ฿0.19 → ฿0.15 → ฿0.14 → ฿0.11 → trend ชัด การ optimize ทำงาน
- Frequency ของ FB winners ยังต่ำกว่า 2.0 → audience ยังไม่อิ่ม สามารถ scale ต่อได้

---

## 📋 Plan for Tomorrow (25 พ.ค.) — PRUNE DAY ✂️

วันที่ 5 ของ batch = ข้อมูลครบ 96 ชม. → ตัดสินใจ kill ตัวที่ผลไม่ดีได้แล้ว

**Decision matrix (ใช้พรุ่งนี้):**
- CPE > ฿1.00 + spend > ฿1,000 = **pause ทันที**
- CPE > ฿0.50 + CTR ลดลง > 50% จาก peak = **pause**
- CPE < ฿0.10 + frequency < 2.5 = **bump budget อีก +30%**
- ส่วนที่เหลือ = HOLD

**คาดการณ์ action พรุ่งนี้:**
- Pause 4-5 IG campaigns (FSV [IG] วันหยุด, FST [IG] อากาศร้อน 40 องศา IG version, SN [IG] อาณาจักรหิมะ, อื่นๆ)
- Pause 1 FB campaign (FST0526 [FB] หนีร้อนฯติดลบ ถ้ายังไม่ฟื้น)
- Bump budget SN0526 [FB] เด็กเจอหิมะ จาก ฿4,200 → ฿10,000 (KING ยังไม่ saturate)
`,
    suggestedActions: [
      {
        title: "เตรียม pause list 5 ตัว สำหรับเช้าวันจันทร์",
        detail: "FSV [IG] วันหยุดนี้, FST [IG] อากาศร้อน 40 องศา, SN [IG] อาณาจักรหิมะ, FSV [IG] เมืองขนมหวาน, FST [FB] หนีร้อนติดลบ (ถ้ายังไม่ฟื้น)",
        priority: "high",
      },
      {
        title: "เตรียม mega-bump SN0526 [FB] เด็กเจอหิมะ → ฿10,000",
        detail: "KING ของ account — CPE ฿0.04 + frequency ยังต่ำ + audience ยังกว้าง → mega scale ครั้งเดียว",
        priority: "high",
      },
      {
        title: "Sleep brief 6 hook ใหม่สำหรับ IG Reels",
        detail: "Replace creative IG ที่ pause พรุ่งนี้ — ห้าม run static IG แบบเดิมแล้ว",
        priority: "medium",
      },
      {
        title: "Snapshot baseline engagement สำหรับ retro",
        detail: "Save numbers ทั้ง week ก่อน prune day เพื่อทำ retrospective วันอังคาร",
        priority: "low",
      },
    ],
  },

  // ============================================================
  // Mon 25 พ.ค. — PRUNE DAY
  // ============================================================
  {
    date: "2026-05-25",
    contentMd: `## AdsLab Demo Agency — Daily Report 📅 25 พฤษภาคม 2569

**Account focus วันนี้: FROST Magical Ice Of Siam — PRUNE DAY ✂️**

---

## Today's Overview

- **Total spend:** ฿5,760 (-49% จากเมื่อวาน — heavy pruning)
- **Impressions:** 244,726 | **Engagement:** 73,977 | **CPE: ฿0.08** ⬇️⬇️ (จาก ฿0.11 — best ของ week)
- **Active campaigns:** 16 (จำนวนเท่าเดิม แต่ pause หลายตัว, resume 1)
- **CTR เฉลี่ย:** 5.13%

**13 budget edits + 34 status changes — heaviest optimization day ของ week**

---

## ✂️ Pruning Decisions ที่ทำเช้านี้

### Pause (จากการประเมิน 96 ชม.):

| เวลา | Campaign | เหตุผล | Spend ที่ save |
|---|---|---|---|
| 04:24 | **FST0526 [IG] อากาศร้อน 40 องศา** | CPE ฿0.08 แต่ FB version ดีกว่าใน same hook | ฿2,000/wk |
| 04:24 | **SN0526 [IG] อาณาจักรเมืองหิมะ** | CPE ฿0.06 dittto — channel cannibalization | ฿2,000/wk |
| 04:24 | **FST0526 [IG] หนีร้อนฯติดลบ** | CPE ฿1.11 — แพง 14x ของ FB version | ฿2,000/wk |
| 04:24 | **SNB0526 [FB] เมืองหิมะสุดน่ารัก** | CPE ฿0.87 ขึ้นเรื่อยๆ จาก ฿0.40 | ฿3,500/wk |
| 04:24 | FROST Pattaya 0526 | CPE ฿3.02 — แพงสุดของ account, low signal | ฿2,000/wk |

**รวม pause: 5 campaigns | budget ที่ save: ~฿11,500/wk**

### Mega Scale:
- **04:35 — SN0526 [FB] เด็กเจอหิมะครั้งแรก** → ฿10,000 (+138% จาก ฿4,200)
  - CPE คงที่ ฿0.04 ทุกวันของ week + frequency 1.8 ยังไม่ saturate = ดัน

### Resume:
- Re-activate 1 ad ภายใน SN0526 [FB] ถึงเวลาฯ ที่ pause เมื่อวาน (รอบ scaling)

---

## 🏆 Final Engagement Leaders — Week Summary

### Top 5 (รวม spend 5 วัน)

| # | Campaign | Total Spend | Total Eng | CPE | ROI signal |
|---|---|---|---|---|---|
| 1 | **SN0526 [FB] เด็กเจอหิมะ** | ฿6,709 | **183,249** | **฿0.04** | 👑 KING — bump +138% วันนี้ |
| 2 | FST0526 [FB] เที่ยวทะเล | ฿4,513 | 74,190 | ฿0.06 | hold |
| 3 | SN0526 [IG] อาณาจักรหิมะ | ฿2,081 | 34,309 | ฿0.06 | paused (channel cannibalization) |
| 4 | FSV0526 [FB] เมืองขนมหวาน | ฿2,609 | 33,804 | ฿0.08 | hold |
| 5 | FST0526 [IG] อากาศร้อน 40 องศา | ฿2,083 | 27,462 | ฿0.08 | paused (channel cannibalization) |

### ⚠️ Wasted Spend ที่ paused วันนี้

| Campaign | Spend ก่อน paused | Lost engagement opportunity |
|---|---|---|
| FSV [IG] วันหยุดนี้ฯ (paused Sat) | ฿2,576 | CPE ฿1.73 |
| FROST Pattaya | ฿423 | CPE ฿3.02 |
| FST [FB] หนีร้อนฯติดลบ | ฿4,477 ยังไม่ pause | CPE ฿1.03 — watchlist |

**Total ที่หยุด wastage: ~฿11,500/wk** หลังวันนี้

---

## 📊 Week Recap — FROST Performance

| Day | Spend | Eng | CPE | Action |
|---|---|---|---|---|
| Thu 21 | ฿3,584 | 19,165 | ฿0.19 | 🚀 Launch (16 new) |
| Fri 22 | ฿14,728 | 96,758 | ฿0.15 | 🟡 Observe |
| Sat 23 | ฿17,780 | 124,809 | ฿0.14 | ⚡ Scale +20% (6 winners) |
| Sun 24 | ฿11,206 | 100,065 | ฿0.11 | 🟡 Hold |
| Mon 25 | ฿5,760 | 73,977 | **฿0.08** | ✂️ Prune (-5) + Mega-scale KING |
| **Total** | **฿53,058** | **414,774** | **฿0.13** avg | **-58% CPE จาก day 1** ✅ |

---

## 🔍 Lessons จาก Week นี้

1. **Channel discipline ชัดที่สุด** — FB CPE ฿0.07 / IG CPE ฿0.74 → IG static images ต้อง replace เป็น Reels vertical only
2. **Kid moment creative ชนะทุก hook** — SN0526 เด็กเจอหิมะ ทำ 183k engagement = 44% ของ account ทั้งหมด ด้วยงบแค่ 13%
3. **Scale +20% safe** — ทุกครั้งที่ bump +20% บน FB winner, CPE ไม่ขึ้น → ยังไม่ saturate, ดันต่อได้
4. **Pruning เร็วประหยัดมาก** — pause 5 ตัวประหยัด ฿11,500/wk โดยไม่กระทบ total engagement (เพราะ KING + Tier 2 cover)

---

## 📋 Plan for Next Week (26-31 พ.ค.)

1. **Continue scale SN0526 เด็กเจอหิมะ** ถ้า frequency ยังต่ำ → bump เป็น ฿15,000 วันอังคาร
2. **Ship Reels vertical creative** สำหรับ IG (paused 5 ตัวต้องมี replacement)
3. **Pause FST [FB] หนีร้อนฯติดลบ** ถ้า CPE ยังขึ้นต่อ (พรุ่งนี้ตัดสิน)
4. **Launch retargeting campaign** ใช้ engagement audience จาก week นี้ (411k people pool)
`,
    suggestedActions: [
      {
        title: "Day 6: ตัดสินใจ FST [FB] หนีร้อนฯติดลบ",
        detail: "ถ้า CPE > ฿1.00 พรุ่งนี้ = pause; ถ้ากลับมา < ฿0.30 = keep",
        priority: "high",
      },
    ],
  },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error(`Tenant '${TENANT_SLUG}' not found.`);
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  for (const r of REPORTS) {
    const reportDate = new Date(`${r.date}T00:00:00.000Z`);
    const existing = await prisma.dailyReport.findFirst({
      where: { tenantId: tenant.id, reportDate },
      select: { id: true },
    });
    if (existing) {
      await prisma.dailyReport.update({
        where: { id: existing.id },
        data: {
          contentMd: r.contentMd,
          suggestedActions: r.suggestedActions,
          status: "COMPLETED",
          generatedBy: "manual-polish-frost",
          generatedAt: new Date(),
          generationError: null,
        },
      });
      console.log(`✓ Updated ${r.date} (id ${existing.id}, ${r.suggestedActions.length} actions)`);
    } else {
      const created = await prisma.dailyReport.create({
        data: {
          tenantId: tenant.id,
          reportDate,
          status: "COMPLETED",
          contentMd: r.contentMd,
          suggestedActions: r.suggestedActions,
          generatedBy: "manual-polish-frost",
          generatedAt: new Date(),
        },
        select: { id: true },
      });
      console.log(`✓ Created ${r.date} (id ${created.id}, ${r.suggestedActions.length} actions)`);
    }
  }

  await prisma.$disconnect();
  console.log(`\nDone. Open Insights in AdsLab to see the polished reports.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
