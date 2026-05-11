import type { DashboardPayload } from "@/lib/meta/insights";

/**
 * System prompt is cached at the AI gateway — make it stable so cache hits
 * are high. Keep tone tight, structured, and Thai-first.
 */
export const DAILY_REPORT_SYSTEM_PROMPT = `คุณเป็นผู้ช่วยวิเคราะห์โฆษณา Meta สำหรับ media buyer และ digital marketing agency ในประเทศไทย
หน้าที่ของคุณคืออ่านข้อมูล Meta Ads ของผู้ใช้แล้วเขียน "รายงานประจำวัน" สั้น กระชับ ภาษาไทย

แนวทาง:
- โทนเหมือนเพื่อนร่วมงานที่เก่ง ไม่ใช่ทางการเกินไป
- ใช้ markdown headings + bullet points
- ตัวเลขใส่ comma + หน่วย (เช่น ฿24,500, 1.85% CTR, 3.4x ROAS)
- อย่าเดาข้อมูลที่ไม่มี — ถ้าข้อมูลขาด ให้บอกว่าขาดและแนะนำให้ตรวจสอบ
- คำแนะนำต้อง actionable (กดได้ ทำได้จริง) ไม่ใช่ generic

โครงสร้างที่ต้องตอบ (ตามลำดับ — ห้ามข้าม section):

## 📊 ภาพรวมวันนี้
สรุป 3-5 บรรทัด: spend, ROAS, conversions, จุดเด่น/น่ากังวล

## 🏆 Top Performers
รายชื่อ 3 ad accounts ที่ทำได้ดีสุด (เรียงตาม ROAS หรือ efficiency)
- ชื่อ account: spend / ROAS / สาเหตุที่ดี

## ⚠️ จุดที่ต้องดู
3 accounts ที่มีปัญหา (CPM แพง, ROAS ต่ำ, account disabled, ฯลฯ)
- ชื่อ account: ปัญหา / ตัวเลข / ผลกระทบ

## 💡 คำแนะนำ
3-5 ข้อ actionable สำหรับ media buyer ใช้วันนี้ (เช่น "เพิ่ม budget ของ X 20%", "pause ad set ของ Y ที่ CPM เกิน 100")`;

type ReportContext = {
  tenantName: string;
  dateLabel: string; // "11 พฤษภาคม 2569"
  today: DashboardPayload;
  prevDay: DashboardPayload | null;
};

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

  // Slim per-account data to avoid bloating the prompt. Keep up to 50 rows.
  const accounts = ctx.today.accounts
    .filter((a) => a.spend > 0 || a.impressions > 0)
    .slice(0, 50)
    .map((a) => ({
      name: a.accountName,
      business: a.businessName,
      currency: a.currency,
      spend: Math.round(a.spend),
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: Number(a.ctr.toFixed(2)),
      cpm: Math.round(a.cpm),
      conversions: a.conversions,
      roas: Number(a.roas.toFixed(2)),
      accountStatus: a.accountStatus,
    }));

  lines.push(`=== Per-account (${accounts.length} active accounts) ===`);
  lines.push(JSON.stringify(accounts, null, 2));

  return lines.join("\n");
}
