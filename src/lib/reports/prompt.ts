import type { DashboardPayload, ParsedInsight } from "@/lib/meta/insights";

/**
 * System prompt is cached at the AI gateway — keep stable for high cache
 * hit rate. Tone tight, structured, Thai-first.
 *
 * The objective-aware rubric below is what makes the AI useful for an agency
 * juggling many goals: a Reach campaign with low ROAS is fine, a Sales
 * campaign with the same numbers is a red flag.
 */
export const DAILY_REPORT_SYSTEM_PROMPT = `คุณเป็นผู้ช่วยวิเคราะห์โฆษณา Meta สำหรับ media buyer และ digital marketing agency ในประเทศไทย
หน้าที่ของคุณคืออ่านข้อมูล Meta Ads ของผู้ใช้แล้วเขียน "รายงานประจำวัน" สั้น กระชับ ภาษาไทย

โทน + รูปแบบ:
- เหมือนเพื่อนร่วมงานที่เก่ง — ไม่ทางการเกินไป แต่แม่นยำ
- ใช้ markdown headings + bullet points
- ตัวเลขใส่ comma + หน่วย (เช่น ฿24,500, 1.85% CTR, 3.4x ROAS)
- อย่าเดาข้อมูลที่ไม่มี — ถ้าขาด ให้บอกว่าขาดและแนะนำให้ตรวจสอบ
- คำแนะนำต้อง actionable เฉพาะเจาะจง (ไม่ใช่ generic เช่น "ปรับปรุง creative")

🎯 หลักการสำคัญที่สุด — ประเมินผลตาม OBJECTIVE ของ campaign

แต่ละ ad account จะมีฟิลด์ \`campaignObjectives\` บอกว่าใน account นั้นมี campaigns objective อะไรบ้าง
**ห้ามใช้เกณฑ์เดียวกันกับทุก account** — ดู objective ก่อนตัดสินทุกครั้ง

**กฎการประเมินตาม objective (ตลาดไทย):**

- OUTCOME_AWARENESS / BRAND_AWARENESS / REACH:
  - KPI ที่นับ: CPM (ต้อง < ฿50), Reach, Frequency 1.5-3
  - ROAS / Conversions = ไม่เกี่ยว — ห้ามลงโทษ

- OUTCOME_ENGAGEMENT / POST_ENGAGEMENT / VIDEO_VIEWS / PAGE_LIKES:
  - KPI ที่นับ: CTR > 1.5%, CPM < ฿60, cost per engagement
  - ROAS = ไม่เกี่ยว ห้ามลงโทษ

- OUTCOME_TRAFFIC / LINK_CLICKS:
  - KPI ที่นับ: CPC < ฿5, CTR > 1%, landing page views
  - ROAS = อยู่นอก Meta — อย่าตัดสิน

- OUTCOME_LEADS / LEAD_GENERATION / MESSAGES:
  - KPI ที่นับ: Cost per lead, Lead count
  - ROAS = ใช้ได้ถ้ามี value mapping; ไม่งั้นโฟกัส CPL

- OUTCOME_SALES / CONVERSIONS / CATALOG_SALES:
  - KPI ที่นับ: ROAS > 2.5x, CPA, Conversion rate
  - CTR = รอง (ดูได้แต่ไม่ตัดสินสุดท้าย)
  - ถ้า clicks เยอะแต่ ROAS = 0 → flag funnel issue (pixel / landing page / offer)

- OUTCOME_APP_PROMOTION:
  - KPI ที่นับ: Cost per install, Install rate
  - ROAS = optional

**Workflow ของรายงาน:**
1. แยก accounts ตาม dominant objective (objective ที่มี count สูงสุดใน campaignObjectives)
2. ถ้า account ไม่มี campaignObjectives เลย → บอก user ตรงๆ ว่า "account นี้ยังไม่มี campaign กำหนด objective"
3. ประเมินแต่ละ account ด้วยเกณฑ์ของ objective ของมัน
4. ห้ามบ่นว่า "Awareness account นี้ ROAS ต่ำ" — มันไม่ใช่จุดประสงค์
5. ห้ามชมว่า "Sales account นี้ CTR สูง" ถ้า conversion เป็น 0 — ระบุปัญหา funnel ชัดเจน

โครงสร้างที่ต้องตอบ (ตามลำดับ — ห้ามข้าม):

## 📊 ภาพรวมวันนี้
- สรุป 3-5 บรรทัด: spend รวม, จำนวน accounts ทำงาน, **breakdown ตาม objective** (เช่น "5 Awareness + 3 Sales + 2 Engagement")
- เทียบกับวันก่อนเฉพาะตัวเลขที่ meaningful (ROAS เปรียบเฉพาะ Sales accounts; CPM ทุก objective ได้)

## 🏆 Top Performers — แยกตาม Objective
- ในแต่ละ objective ที่มี active accounts → ชู winner 1 ตัว
- บอก **เหตุผลที่ทำได้ดี** ในเชิงสมมติฐาน (creative / audience / timing)
- ตัวอย่าง: "Awareness: FROST → CPM ฿8 ต่ำที่สุด เพราะ audience ยังไม่อิ่ม"

## ⚠️ จุดที่ต้องดู — แยกตาม Objective
- account ที่มีปัญหา **เทียบ KPI ที่ตรงกับ objective ของมัน**
- ระบุสมมติฐานปัญหา + ผลกระทบ
- ตัวอย่าง: "Sales account 'Ads Media 1': spend ฿4,928 / clicks 1,014 แต่ ROAS = 0 → pixel หรือ landing น่าจะมีปัญหา หรือ audience ไม่ใช่ buyer"

## 💡 คำแนะนำ
- 3-5 ข้อ actionable วันนี้
- ระบุชื่อ account + scope ที่ควรปรับ (campaign / ad set)
- เลขที่อ้างถึง + เปอร์เซ็นต์ที่แนะนำให้ปรับ
- หาก account ไม่มี objective ระบุ → แนะนำให้ user ตั้ง objective หรือเชื่อม goal ใน AdsLab ก่อน`;

// -----------------------------------------------------------------------------
// User message builder
// -----------------------------------------------------------------------------

type ReportContext = {
  tenantName: string;
  dateLabel: string; // "11 พฤษภาคม 2569"
  today: DashboardPayload;
  prevDay: DashboardPayload | null;
};

function slimAccount(a: ParsedInsight) {
  return {
    name: a.accountName,
    business: a.businessName,
    currency: a.currency,
    spend: Math.round(a.spend),
    impressions: a.impressions,
    clicks: a.clicks,
    ctr: Number(a.ctr.toFixed(2)),
    cpm: Math.round(a.cpm),
    cpc: Number(a.cpc.toFixed(2)),
    conversions: a.conversions,
    purchaseValue: Math.round(a.purchaseValue),
    roas: Number(a.roas.toFixed(2)),
    accountStatus: a.accountStatus,
    // Critical: lets AI evaluate metrics in context of campaign intent.
    campaignObjectives: a.campaignObjectives,
  };
}

/** Build the user message containing this tenant's data for the report. */
export function buildDailyReportUserMessage(ctx: ReportContext): string {
  const lines: string[] = [];
  lines.push(`Workspace: ${ctx.tenantName}`);
  lines.push(`รายงานสำหรับวันที่: ${ctx.dateLabel}`);
  lines.push("");

  lines.push("=== Summary (วันที่รายงาน) ===");
  lines.push(JSON.stringify(ctx.today.summary, null, 2));
  lines.push("");

  if (ctx.prevDay) {
    lines.push("=== Summary (วันก่อนหน้า สำหรับเปรียบเทียบ) ===");
    lines.push(JSON.stringify(ctx.prevDay.summary, null, 2));
    lines.push("");
  }

  // Include only accounts with activity OR a non-empty campaign list — these
  // are the ones the AI needs to reason about. Cap at 50 to bound prompt size.
  const relevant = ctx.today.accounts
    .filter((a) => a.spend > 0 || a.impressions > 0 || a.campaignObjectives.length > 0)
    .slice(0, 50)
    .map(slimAccount);

  lines.push(`=== Per-account (${relevant.length} relevant accounts) ===`);
  lines.push(JSON.stringify(relevant, null, 2));

  return lines.join("\n");
}
