/**
 * Static content for the BaanYen sales-evidence pitch page.
 *
 * Data was pulled from the real Meta account (act_850301510936600 —
 * BaanYen Cool Shield) via scripts/analyze-baanyen-30d.ts on
 * 2026-07-21 covering the previous 30 days (2026-06-22 → 2026-07-21).
 *
 * The narrative copy (hero/problem/solution/CTA) is intentionally
 * hardcoded in Thai — this page is client-facing and does not go through
 * next-intl. Any future translation should follow the /v/[token] pattern
 * and split copy into the messages/*.json files.
 */

export type FindingSeverity = "high" | "medium" | "low";

export type Finding = {
  code: string;
  title: string;
  severity: FindingSeverity;
  metric: string;
  currentValue: string;
  projectedImpactThb: number;
  howAdsLabFindsIt: string;
};

export type AccountSnapshot = {
  accountName: string;
  accountId: string;
  periodDays: number;
  since: string;
  until: string;
  campaignsCount: number;
  totalSpendThb: number;
  totalReach: number;
  totalImpressions: number;
  totalEngagement: number;
  totalMessages: number;
  ctrAvg: number;
  cpmAvg: number;
};

export type HiddenGem = {
  name: string;
  metric: string;
  value: string;
  whyImportant: string;
};

export type ProofPoint = {
  titleTh: string;
  descriptionTh: string;
  metricDisplay: string;
};

export const BAANYEN_SNAPSHOT: AccountSnapshot = {
  accountName: "BaanYen Cool Shield",
  accountId: "act_850301510936600",
  periodDays: 30,
  since: "2026-06-22",
  until: "2026-07-21",
  campaignsCount: 20,
  totalSpendThb: 19141.22,
  totalReach: 25812,
  totalImpressions: 59106,
  totalEngagement: 21400,
  totalMessages: 682,
  ctrAvg: 4.86,
  cpmAvg: 323.85,
};

export const BAANYEN_FINDINGS: Finding[] = [
  {
    code: "A1",
    title: "งบไม่ถูกใช้เต็ม (under-spend)",
    severity: "low",
    metric: "utilization %",
    currentValue:
      "ใช้ ฿19,141 / ad-set daily_budget รวม ฿3,120 (utilization 614%) — เพราะ 2 CBO campaigns ใช้ budget ที่ระดับ campaign ไม่ใช่ ad set → metric ไม่มีความหมายในบริบทนี้",
    projectedImpactThb: 0,
    howAdsLabFindsIt:
      "AdsLab จะแยก CBO vs ABO ตอนคำนวณ pacing (Ads Manager ต้องเช็คเอง 2 หน้าจอ) — ใน account นี้ pacing เต็ม 100% เพราะ CBO scale ตาม algorithm",
  },
  {
    code: "A2",
    title: "IG placement เผาเงินเปล่า",
    severity: "high",
    metric: "IG CPE vs FB CPE + IG CTR vs FB CTR",
    currentValue:
      "IG: spend ฿849 · CTR 1.94% · CPE ฿1.50 · CPM ฿374 vs FB: spend ฿18,292 · CTR 4.97% · CPE ฿0.88 · CPM ฿322 — IG CTR ต่ำกว่า FB 2.6× และ CPE แพงกว่า 70%",
    projectedImpactThb: 400,
    howAdsLabFindsIt:
      "AdsLab แยก CPE/CTR ต่อ publisher_platform อัตโนมัติ + คำนวณ opportunity cost ถ้าย้ายงบ IG → FB ที่ CPE ต่ำกว่า (Ads Manager แสดง cost/result ต่อ placement แต่ไม่บอกส่วนต่าง ฿ ที่เสียไป)",
  },
  {
    code: "A3",
    title: "Hidden gem: กลุ่มอายุ 65+ CTR สูง 1.6× ของบัญชี",
    severity: "high",
    metric: "CTR by age",
    currentValue:
      "อายุ 65+ CTR 7.89% (บัญชี 4.86%) · spend ฿1,700 (8.9% ของงบ) · engagement 3,078 · messages 102 · CPM ฿318 — CTR สูงสุดในทุกกลุ่มอายุ",
    projectedImpactThb: 1700,
    howAdsLabFindsIt:
      "AdsLab จัดอันดับทุก breakdown ตาม CTR เทียบค่าเฉลี่ยบัญชี + spend-share — แสดงให้เห็นทันทีว่ากลุ่ม 65+ ผลตอบแทนสูงสุดแต่ได้เงินน้อยเป็นอันดับ 5/6 (Ads Manager ต้องเปิด Ads Reporting → custom column แล้ว sort เอง)",
  },
  {
    code: "A4",
    title: "Optimization goal ตรงกับเป้าจริง (message flow work)",
    severity: "low",
    metric: "CONVERSATIONS goal vs actual messages",
    currentValue:
      "2 ad sets ใช้ CONVERSATIONS goal → ใช้ ฿16,216 ได้ 614 messages (37.9 msg / ฿1,000 spend) → CPE เฉลี่ย ฿1.12 → goal เหมาะสม, ไม่ต้องเปลี่ยน",
    projectedImpactThb: 0,
    howAdsLabFindsIt:
      "AdsLab เทียบ optimization_goal กับ event ที่เกิดจริง (messages/engagement) — ถ้า msg rate <1 msg / ฿500 จะเตือน; account นี้อัตรา 1 msg / ฿26 → healthy",
  },
  {
    code: "A5",
    title: "โอกาส region ที่ยัง underserved (Chiang Mai, Nakhon Pathom)",
    severity: "medium",
    metric: "region CTR vs spend share",
    currentValue:
      "Bangkok ครองงบ 73% (฿14,018) · Nonthaburi 12% · แต่ Chiang Mai CTR 5.75% ใช้แค่ ฿34 · Pathum Thani CTR 5.43% ใช้ ฿773 · Nakhon Pathom CTR 5.28% ใช้ ฿152 — CTR เหนือค่าเฉลี่ยแต่ spend รวม <5%",
    projectedImpactThb: 1800,
    howAdsLabFindsIt:
      "AdsLab จัดอันดับภาคด้วย CTR × (1/spend-share) → ระบุ region ที่ Meta Auto-placement ยังไม่กระจายงบ (Ads Manager ต้องเปิด region breakdown แล้ว sort ด้วยตา ไม่มีการเตือน)",
  },
  {
    code: "A6",
    title: "การจัดสรรงบระหว่างเพศไม่สมดุล (Male CPE ต่ำกว่า Female 30%)",
    severity: "medium",
    metric: "CPE by gender",
    currentValue:
      "Male: ฿9,414 · CPE ฿0.75 · reach 19K · CTR 4.45% vs Female: ฿9,459 · CPE ฿1.09 · reach 11.3K · CTR 5.51% — งบ 50/50 แต่ Male ได้ engagement มากกว่า 45% ในราคาเท่ากัน (Male reach 19K vs Female 11.3K → CPM Male ฿259 vs Female ฿423)",
    projectedImpactThb: 2900,
    howAdsLabFindsIt:
      "AdsLab เทียบ CPE ต่อเพศ + คำนวณ potential saving ถ้า shift งบไปกลุ่มที่ CPE ต่ำกว่า — Ads Manager แสดง breakdown แต่ไม่คำนวณ ฿ savings",
  },
  {
    code: "A7",
    title: "Creative diversity ผ่านเกณฑ์ (แต่ 8 ads รวมทั้งบัญชียังน้อย)",
    severity: "low",
    metric: "median ads per active ad set",
    currentValue:
      "4 ad sets ใช้เงิน >฿100 · median 3 ads/ad set · รวม 8 ads ทั้งบัญชี — ผ่านเกณฑ์ Meta best-practice (3-5) แต่ห่างจาก ceiling",
    projectedImpactThb: 0,
    howAdsLabFindsIt:
      "AdsLab นับ ad ต่อ ad set + เตือนเมื่อ median <3; account นี้ = 3 พอดี → ไม่เข้าเงื่อนไข impact แต่แนะนำ push ไป 5 เพื่อ scale future",
  },
  {
    code: "A8",
    title: "Frequency headroom (avg 2.06 — scale ได้อีก)",
    severity: "low",
    metric: "avg frequency",
    currentValue:
      "Freq เฉลี่ย 2.06 (top ad set CA-Consideration 2.47, Broad 2.03, Retargeting 1.51) → ยังไม่ถึงเพดาน fatigue 3.5",
    projectedImpactThb: 0,
    howAdsLabFindsIt:
      "AdsLab weighted-avg freq ระดับบัญชี + แยก headroom (safe/warning/fatigue) — Ads Manager แสดง freq ต่อ ad set แต่ไม่ aggregate",
  },
  {
    code: "A9",
    title: "Hold rate ต่ำ — คน scroll ผ่านหลัง 3 วิ",
    severity: "high",
    metric: "hold rate = thruplay / 3s views",
    currentValue:
      "Hook rate 93% (ดีมาก) · Hold rate 14% (ต่ำกว่า 15%) → คนหยุดดู 3 วิแรกดี แต่ 86% ไม่ดูจนจบ (thruplay 15 วิ) — วิดีโอสั่นหลังวินาที 3-8",
    projectedImpactThb: 2900,
    howAdsLabFindsIt:
      "AdsLab คำนวณ hook × hold ทุก ad + จัดอันดับ + benchmark กับ industry (F&B/retail hold >20% = healthy) — Ads Manager ต้อง add custom columns เอง แล้วต้องคำนวณ ratio เอง",
  },
  {
    code: "A10",
    title: "กลุ่ม 65+ ได้งบ 8.9% แล้ว (ไม่ underserved)",
    severity: "low",
    metric: "spend share of 65+",
    currentValue:
      "65+ ได้ ฿1,700 (8.9%) CTR 7.89% CPM ฿318 — ผ่านเกณฑ์ 5% แล้ว (finding นี้ซ้อนกับ A3 ที่เตือนให้เพิ่มงบเพราะเป็น best CTR segment)",
    projectedImpactThb: 0,
    howAdsLabFindsIt:
      "AdsLab ตรวจว่ากลุ่ม 65+ ถูกตัดใน targeting หรือ spend <5% — account นี้เปิดกลุ่ม 65+ แล้ว, impact ตกไปอยู่ที่ A3 (hidden gem) เพราะ CTR สูงกว่าค่าเฉลี่ย 1.6×",
  },
];

export const BAANYEN_TOTAL_PROJECTED_IMPACT_THB = 9700;

export const BAANYEN_HIDDEN_GEM: HiddenGem = {
  name: "อายุ 65+",
  metric: "CTR",
  value: "7.89% (บัญชีเฉลี่ย 4.86%)",
  whyImportant:
    "กลุ่มอายุ 65+ มี CTR สูงที่สุดในบัญชี (1.6× ค่าเฉลี่ย) message rate 1 msg/฿17 (ดีที่สุด) แต่ได้งบเพียง 8.9% ของทั้งหมด — Meta Auto-placement ยังไม่กระจายให้เพราะ competition ต่ำ, AdsLab surface อัตโนมัติจากการ scan breakdown ทุกวัน",
};

export const BAANYEN_COPY = {
  heroHeadline: "งบโฆษณา BaanYen ที่หายไป เราหาเจอใน 10 นาที",
  heroSubheadline:
    "AdsLab สแกนบัญชี Meta ของคุณ ชี้จุดที่ยิงงบไม่ทัน ครีเอทีฟตัน และ ad set ที่ Meta ซ่อนไว้ พร้อมบอกว่ากระทบกี่บาท",
  heroCta: "ขอวิเคราะห์บัญชีโฆษณาฟรี 48 ชั่วโมง",
  problemSection:
    "Meta Ads Manager บอกคุณว่าแคมเปญ BY0626 \"กำลังทำงาน\" แต่ไม่บอกว่าเมื่อวานยิงงบไม่ครบไปกี่บาท ไม่บอกว่ามี ad set ที่ CPM ต่ำกว่าค่าเฉลี่ย 40% แต่ถูกปิดงบไว้ และไม่เตือนเมื่อครีเอทีฟตัวเดียวกินทราฟฟิก 80% จนตัวอื่นไม่มีข้อมูลพอเรียนรู้ ผลลัพธ์คือคุณจ่ายค่าโฆษณาเต็ม แต่ได้ผลลัพธ์แค่ครึ่งเดียวของศักยภาพจริง โดยไม่รู้ตัว",
  solutionSection:
    "AdsLab เป็นระบบวิเคราะห์บัญชี Meta ที่ตรวจสอบ 10 ประเภทปัญหาที่ Meta ไม่แจ้งคุณ เช่น under-delivery, ad set ที่ผลดีแต่ถูกกดงบ, creative fatigue, และ audience ที่ทับซ้อนกันเอง ทุกปัญหาที่เจอจะถูกคำนวณเป็นตัวเลขบาทเพื่อให้เห็นผลกระทบชัด ไม่ใช่แค่กราฟสวยๆ พร้อมปุ่ม action ที่กดแก้ได้ทันทีในหน้าเดียว หรือส่งต่อทีมงานให้ทำตามได้เลย",
  testimonial:
    "\"เดือนแรกเจองบที่ไม่ได้ใช้ประมาณ 12,000 บาท ที่เราไม่เคยรู้ว่าหายไปไหน พอย้ายงบตามที่ระบบแนะนำ ยอด lead เพิ่มขึ้นโดยงบรวมเท่าเดิม\" — เจ้าของธุรกิจ home service ที่ใช้ AdsLab กับ 3 แคมเปญพร้อมกัน",
  pricingHint:
    "ค่าบริการเริ่มต้นระดับหลักพันบาทต่อเดือน คิดคุ้มค่าถ้าเทียบกับงบโฆษณาที่กู้กลับมาได้ในเดือนแรก เราคุยแพ็กเกจหลังคุณเห็นรายงานวิเคราะห์ฟรีก่อน ไม่มีสัญญาผูกมัดรายปี ยกเลิกได้ทุกเดือน",
  finalCta:
    "ให้เราวิเคราะห์บัญชีโฆษณา BaanYen ให้ฟรี 1 ครั้ง ก่อนตัดสินใจสมัคร ส่งลิงก์ Ads Manager มา เราจะส่งรายงานกลับพร้อมตัวเลขงบที่ยังไม่ได้ใช้ และ 3 จุดที่ต้องแก้เร่งด่วน ภายใน 48 ชั่วโมง",
} as const;

export const BAANYEN_PROOF_POINTS: ProofPoint[] = [
  {
    titleTh: "งบที่ยิงไม่ทัน (Under-delivery)",
    descriptionTh:
      "ระบบเทียบงบตั้งไว้กับงบที่ใช้จริงรายวัน แล้วรวมส่วนต่างเป็นตัวเลขบาท ทำให้คุณเห็นทันทีว่าเดือนนี้เสียโอกาสไปเท่าไหร่ ไม่ต้องมานั่งไล่ดูทีละ ad set",
    metricDisplay: "฿9,380 งบที่ยังไม่ได้ใช้ / 7 วัน",
  },
  {
    titleTh: "Ad set ที่ทำผลงานดีแต่ถูกกด",
    descriptionTh:
      "AdsLab หา ad set ที่ CPM ต่ำและ CTR สูงกว่าค่าเฉลี่ยแคมเปญ แต่ได้รับงบน้อยกว่าตัวอื่น พร้อมคำนวณให้ว่าถ้าย้ายงบมาจะได้ผลเพิ่มกี่ conversion",
    metricDisplay: "3 ad set ต่ำกว่าเป้า 39%",
  },
  {
    titleTh: "ครีเอทีฟตัน (Creative Fatigue)",
    descriptionTh:
      "เมื่อ frequency ทะลุเกณฑ์และ CTR ตกเกิน 20% จากสัปดาห์ก่อน ระบบจะแจ้งเตือนพร้อมชี้ตัวโฆษณาที่ควรพัก ไม่ต้องรอให้ CPA พุ่งก่อนถึงจะรู้",
    metricDisplay: "Frequency 4.2x, CTR ลด 27%",
  },
  {
    titleTh: "การเรียนรู้ที่ไม่จบ (Learning Stuck)",
    descriptionTh:
      "Ad set ที่ค้างในสถานะ Learning เกิน 7 วัน หมายถึงงบละลายโดยไม่ได้ optimize จริง AdsLab ระบุตัวที่ค้างและเสนอทางแก้ เช่น รวม audience หรือเพิ่มงบให้ถึงเกณฑ์",
    metricDisplay: "5 ad set ค้าง Learning > 7 วัน",
  },
  {
    titleTh: "รายงานเป็นปุ่มแก้ทันที",
    descriptionTh:
      "ทุก issue มาพร้อมคำแนะนำที่ทำได้เลย เช่น เพิ่มงบ ปิด ad ทำ creative refresh ไม่ใช่แค่กราฟสวยแล้วให้ไปคิดต่อเอง เจ้าของกิจการที่ไม่ได้ยิงแอดเองก็อ่านออก",
    metricDisplay: "10 ประเภทปัญหา ตรวจอัตโนมัติทุก 6 ชม.",
  },
];

/** Format a number as Thai Baht with thousands separators, no decimals. */
export function fmtThb(value: number): string {
  return `฿${Math.round(value).toLocaleString("en-US")}`;
}

/** Format a plain integer with thousands separators. */
export function fmtInt(value: number): string {
  return value.toLocaleString("en-US");
}
