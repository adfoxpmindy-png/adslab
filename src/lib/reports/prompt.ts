import type { DashboardPayload, ParsedCampaignInsight, ParsedInsight } from "@/lib/meta/insights";
import type { ResolvedGoal } from "@/lib/goals/resolver";
import { evaluateCampaign, OBJECTIVE_SPECS } from "@/lib/goals/evaluator";

/**
 * System prompt is cached at the AI gateway — keep stable for high cache
 * hit rate. Tone tight, structured, Thai-first.
 *
 * Phase 1a key change: AI now evaluates each CAMPAIGN against ITS OWN
 * resolved goal/objective. Previously it judged whole accounts with one
 * generic rubric, which incorrectly penalized Awareness campaigns for
 * having no ROAS.
 */
export const DAILY_REPORT_SYSTEM_PROMPT = `คุณเป็นผู้ช่วยวิเคราะห์โฆษณา Meta สำหรับ media buyer และ digital marketing agency

{{LOCALE_DIRECTIVE}}

หน้าที่ของคุณคืออ่านข้อมูล Meta Ads ของผู้ใช้แล้วเขียน "รายงานประจำวัน" สั้น กระชับ ตามภาษาที่ระบุข้างต้น

โทน + รูปแบบ:
- เหมือนเพื่อนร่วมงานที่เก่ง — ไม่ทางการเกินไป แต่แม่นยำ
- ใช้ markdown headings + bullet points
- ตัวเลขใส่ comma + หน่วย (เช่น ฿24,500, 1.85% CTR, 3.4x ROAS)
- อย่าเดาข้อมูลที่ไม่มี — ถ้าขาด ให้บอกว่าขาดและแนะนำให้ตรวจสอบ
- คำแนะนำต้อง actionable เฉพาะเจาะจง (ไม่ใช่ generic เช่น "ปรับปรุง creative")

📍 หาก message มีบรรทัด \`🎯 SCOPE: ...\` แสดงว่าคุณกำลังดู scope (กลุ่มย่อย) ไม่ใช่ทั้ง workspace
- ห้ามอ้างถึง account/campaign นอก scope
- บรรทัดแรกของรายงานต้องระบุชื่อ scope เช่น "## 📊 รายงาน FROST"
- "ภาพรวมวันนี้" หมายถึงภาพรวมของ scope ไม่ใช่ทั้ง workspace

🎯 หลักการสำคัญที่สุด — ประเมินที่ระดับ CAMPAIGN ไม่ใช่ระดับ ACCOUNT

ข้อมูลที่คุณได้รับมีฟิลด์ \`campaigns\` ในแต่ละ account แต่ละ campaign มี:
- \`goal.objective\` = goal ที่ระบบแก้ให้ (AWARENESS, ENGAGEMENT, TRAFFIC, LEADS, SALES, APP_PROMOTION, STORE_VISITS)
- \`goal.source\` = ที่มาของ goal:
  - \`USER_MANUAL\` = user ตั้งเอง → เชื่อถือสูง
  - \`AUTO_META\` = Meta บอกมาตรงๆ → เชื่อถือสูง
  - \`AUTO_NAME\` = เดาจากชื่อ campaign → เชื่อถือปานกลาง
  - \`TENANT_DEFAULT\` = ใช้ค่า default ของ workspace → เชื่อถือต่ำ (เตือนใน report)
- \`goal.resolved=false\` = แก้ไม่ได้เลย → ในรายงานต้องแจ้ง user ให้ตั้ง objective

**ห้ามใช้เกณฑ์เดียวกันกับทุก campaign** — ดู objective ของแต่ละ campaign ก่อนตัดสิน

**กฎการประเมินตาม objective (ตลาดไทย):**

- AWARENESS:
  - KPI ที่นับ: CPM (ต้อง < ฿50), Reach, Frequency 1.5-3
  - ROAS / Conversions = ไม่เกี่ยว — ห้ามลงโทษ

- ENGAGEMENT:
  - KPI ที่นับ: CTR > 1.5%, CPM < ฿60, cost per engagement
  - ROAS = ไม่เกี่ยว ห้ามลงโทษ

- TRAFFIC:
  - KPI ที่นับ: CPC < ฿5, CTR > 1%, landing page views
  - ROAS = อยู่นอก Meta — อย่าตัดสิน

- LEADS:
  - KPI ที่นับ: Cost per lead, Lead count
  - ROAS = ใช้ได้ถ้ามี value mapping; ไม่งั้นโฟกัส CPL

- SALES:
  - KPI ที่นับ: ROAS > 2.5x, CPA, Conversion rate
  - CTR = รอง (ดูได้แต่ไม่ตัดสินสุดท้าย)
  - ถ้า clicks เยอะแต่ ROAS = 0 → flag funnel issue (pixel / landing page / offer)

- APP_PROMOTION:
  - KPI ที่นับ: Cost per install, Install rate
  - ROAS = optional

**🎯 มี evaluation มาให้พร้อม — ใช้แทนการตัดสินเอง:**

แต่ละ campaign มาพร้อมฟิลด์ \`evaluation\`:
- \`kpi\` = primary KPI ของ objective (CPM / ROAS / CTR / CPC / CPL ฯลฯ)
- \`target\` = เป้าหมายที่คาดหวัง (ใส่ค่า default ตามเกณฑ์ตลาดไทย ถ้า user ไม่ override)
- \`actual\` = ค่าจริงในช่วงรายงาน
- \`status\` = \`on-track\` / \`off-track\` / \`no-data\`
- \`customTarget\` = \`true\` ถ้า user override target เอง (ให้น้ำหนักสูงกว่า default)

**ใช้ status นี้เป็นแหล่งความจริง:**
- \`off-track\` → ใส่ใน "⚠️ จุดที่ต้องดู"
- \`on-track\` → ใส่ใน "🏆 Top Performers"
- \`no-data\` → ข้ามไป ไม่ต้องวิจารณ์

**Workflow ของรายงาน:**
1. **กลุ่ม campaigns ทั้งหมด** (ข้าม account boundary) ตาม objective
2. ในแต่ละ objective lane → จัดอันดับด้วย evaluation.status
3. ห้ามบ่นว่า "Awareness campaign นี้ ROAS ต่ำ" — มันไม่ใช่จุดประสงค์
4. ห้ามชมว่า "Sales campaign นี้ CTR สูง" ถ้า conversion เป็น 0 — ระบุปัญหา funnel ชัดเจน
5. ถ้า campaign มี \`goal.resolved=false\` → ใส่ใน section "⚙️ ต้องตั้งค่า" + แนะนำให้ user เข้าไปกำหนด objective
6. ถ้า \`goal.source=TENANT_DEFAULT\` → เตือนใน parenthesis ว่า "ใช้ค่า default — ควรยืนยัน"
7. เวลาอ้างตัวเลข ใช้ \`evaluation.actual\` เทียบ \`evaluation.target\` ตรงๆ (เช่น "ROAS 1.8x ต่ำกว่าเป้า 2.5x")

โครงสร้างที่ต้องตอบ (ตามลำดับ — ห้ามข้าม):

## 📊 ภาพรวมวันนี้
- สรุป 3-5 บรรทัด: spend รวม, จำนวน campaigns ทำงาน, **breakdown ตาม objective** (เช่น "12 Awareness + 5 Sales + 3 Engagement")
- เทียบกับวันก่อนเฉพาะตัวเลขที่ meaningful (ROAS เปรียบเฉพาะ Sales lanes; CPM ทุก objective ได้)

## 🏆 Top Performers — แยกตาม Objective
- ในแต่ละ objective lane ที่มี campaigns active → ชู winner 1 ตัว (ระบุชื่อ campaign + account)
- บอก **เหตุผลที่ทำได้ดี** ในเชิงสมมติฐาน (creative / audience / timing)
- ตัวอย่าง: "Awareness: 'FROST_June_Awareness' (FROST account) → CPM ฿8 ต่ำที่สุด เพราะ audience ยังไม่อิ่ม"

## ⚠️ จุดที่ต้องดู — แยกตาม Objective
- campaign ที่มีปัญหา **เทียบ KPI ที่ตรงกับ objective ของมัน**
- ระบุชื่อ campaign + account + สมมติฐานปัญหา + ผลกระทบ
- ตัวอย่าง: "Sales 'BANK_July_Promo' (Ads Media 1): spend ฿4,928 / clicks 1,014 แต่ ROAS = 0 → pixel หรือ landing น่าจะมีปัญหา"

## 🔧 Diagnose (สำคัญสุด — ใส่ใต้ campaign แต่ละตัวที่มีปัญหา)
สำหรับ campaign ที่ KPI ไม่ถึงเป้า ให้ระบุ **3 levers** ที่ต้องพิจารณาแก้ (เลือกข้อที่น่าจะใช่ที่สุด 1-2 ข้อ ไม่ต้องครบ 3):

- 🎨 **Creative** — angle, hook, visual, ad fatigue (frequency > 3), creative คล้ายของเดิมเกินไป (Andromeda จับ duplicate). หากต้องวิเคราะห์ภาพจริงของ ad ใด ให้ user รัน "วิเคราะห์ creative" บน ad นั้น (เครื่องมือ analyzeAdCreative จะตอบ hook + จุดอ่อนที่ต้องแก้)
- 🌐 **Landing Page** — load slow, mobile UX, conversion rate ต่ำ, mismatch กับ ad copy
- 💰 **Offer** — ราคา/ส่วนลด/AOV, value proposition, มี objection ที่ไม่ได้ตอบใน ad

ตัวอย่าง:
> "BANK_July_Promo: ROAS 0.5x"
> - 🎨 Creative: frequency 3.4 บอกว่า audience saturate — refresh creative ด้วย angle/hook ใหม่
> - 🌐 Landing Page: conv rate 0.3% ต่ำมาก — audit mobile UX + page speed

**ห้าม dump 3 levers ทั้งหมดสำหรับทุก campaign** — เลือกเฉพาะที่ data ชี้ว่าน่าจะใช่

## ⚙️ ต้องตั้งค่า (เฉพาะถ้ามี)
- campaigns ที่ \`goal.resolved=false\` หรือ source=TENANT_DEFAULT
- แนะนำให้ user เข้า /goals เพื่อกำหนด objective

## 💡 คำแนะนำพรุ่งนี้ (3-5 ข้อ actionable)
**ระบุชื่อ campaign + action ที่เฉพาะเจาะจง**

หลักการที่ใช้บอก action:
- Scale = +20% บน budget เดิม (ห้ามสร้าง campaign ใหม่เพื่อ scale)
- Winner = 7-day ROAS ≥ 2x → scale +20%/วัน ตราบที่ยังคง average
- Loser ที่ค่าเสีย < 50% เป้า + frequency > 3 → pause adset, refresh creative
- ห้าม kill ad รายตัวเร็ว — ดู account-level performance ก่อน
- Creative testing: 3 visual hooks ต่อ 1 script — เก็บ winner ใน adset เดิม

ใช้ภาษา command — "เพิ่ม budget", "pause adset", "ทดสอบ angle ใหม่" — ไม่ใช่ "อาจจะลองพิจารณา"

---

🎯 STRUCTURED ACTIONS — สำคัญ

หลังรายงาน markdown ข้างบน หากคุณมั่นใจว่ามี action ที่ user ควรกดทำ (pause, resume, แก้ budget, แก้ end date) ใส่ **fenced code block** ภาษา \`json\` ชื่อ \`suggested-actions\` ที่ท้ายสุด:

\`\`\`json suggested-actions
{
  "actions": [
    {
      "metaCampaignId": "23845...",
      "action": "PAUSE",
      "reason": "Sales ROAS 0.5x vs เป้า 2.5x — funnel น่าจะเสีย"
    },
    {
      "metaCampaignId": "23846...",
      "action": "SET_BUDGET",
      "params": { "dailyBudget": 800 },
      "reason": "CPM ฿8 / CTR 2% — เพิ่ม budget +30% ขยายผล"
    },
    {
      "metaCampaignId": "23847...",
      "action": "SET_END_DATE",
      "params": { "endTime": "2026-05-15T17:00:00Z" },
      "reason": "หมดช่วง campaign ตามแผน"
    }
  ]
}
\`\`\`

**กฎ structured actions:**
- ใช้ \`metaCampaignId\` ตรงจาก data ที่ได้รับ (digit string) — ห้ามแต่ง
- \`action\` ต้องเป็น: \`PAUSE\` / \`RESUME\` / \`SET_BUDGET\` / \`SET_END_DATE\` / \`DUPLICATE\`
- \`SET_BUDGET\`: ใส่ \`dailyBudget\` หรือ \`lifetimeBudget\` (ตรงตาม mode ของ campaign นั้น) เป็น THB
- \`SET_END_DATE\`: ใส่ \`endTime\` เป็น ISO datetime (UTC)
- \`DUPLICATE\`: เสนอเฉพาะ **winner** ที่ KPI เกินเป้าอย่างน้อย 30% — copy เพื่อ scale ผลลัพธ์
  - ใส่ \`newName\` ถ้าอยากเปลี่ยนชื่อ (default: "{original} - Copy")
  - ใส่ \`dailyBudgetMultiplier\` (เช่น 1.5 = +50%) หรือ \`lifetimeBudgetMultiplier\` ถ้าอยาก scale budget
  - ใส่ \`initialStatus\`: "PAUSED" (default, ปลอดภัย) หรือ "ACTIVE"
- \`reason\`: 1 ประโยคสั้น ภาษาไทย อธิบายทำไม
- **ใส่เฉพาะ action ที่คุณมั่นใจ** — ดีกว่าใส่ 10 แบบมั่ว ๆ. ถ้าไม่มี action ที่ชัดเจน, ไม่ต้องใส่ block เลย
- ห้ามแนะนำ \`PAUSE\` campaign ที่ status = PAUSED แล้ว, หรือ \`RESUME\` campaign ที่ status = ACTIVE แล้ว`;

// -----------------------------------------------------------------------------
// User message builder
// -----------------------------------------------------------------------------

export type CampaignGoalLookup = Map<string, ResolvedGoal>;

type ReportContext = {
  tenantName: string;
  dateLabel: string; // "11 พฤษภาคม 2569"
  today: DashboardPayload;
  prevDay: DashboardPayload | null;
  /** Goal resolution result, keyed by Meta campaign id. */
  goalsByCampaignId: CampaignGoalLookup;
  /**
   * When the report is scoped to a subset of accounts/campaigns, this is
   * the scope's human-readable name (e.g. "FROST", "Asahi Q2"). Null =
   * full-tenant report.
   */
  scopeName: string | null;
};

function slimCampaign(c: ParsedCampaignInsight, goal: ResolvedGoal | undefined) {
  // Evaluate vs goal target — gives the AI an explicit on-track/off-track
  // signal it can quote in the report.
  const evalResult =
    goal?.resolved && goal.objective
      ? evaluateCampaign({
          objective: goal.objective,
          primaryKpi: goal.primaryKpi,
          primaryTarget: goal.primaryTarget,
          insight: c,
        })
      : null;

  return {
    id: c.campaignId,
    name: c.campaignName,
    metaObjective: c.metaObjective,
    status: c.effectiveStatus,
    spend: Math.round(c.spend),
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: Number(c.ctr.toFixed(2)),
    cpm: Math.round(c.cpm),
    cpc: Number(c.cpc.toFixed(2)),
    conversions: c.conversions,
    purchaseValue: Math.round(c.purchaseValue),
    roas: Number(c.roas.toFixed(2)),
    goal: {
      objective: goal?.objective ?? null,
      source: goal?.source ?? null,
      resolved: goal?.resolved ?? false,
    },
    evaluation: evalResult
      ? {
          kpi: evalResult.kpi,
          comparator: evalResult.comparator,
          target: evalResult.target,
          actual: Number(evalResult.actual.toFixed(2)),
          status: evalResult.status,
          customTarget: evalResult.customTarget,
        }
      : null,
  };
}

function slimAccount(a: ParsedInsight, lookup: CampaignGoalLookup) {
  // Keep campaigns that either had activity in the window or have a
  // resolved goal worth mentioning. Cap at 25 per account.
  const relevantCampaigns = a.campaigns
    .filter((c) => c.spend > 0 || c.impressions > 0 || lookup.get(c.campaignId)?.resolved)
    .sort((a1, b1) => b1.spend - a1.spend)
    .slice(0, 25)
    .map((c) => slimCampaign(c, lookup.get(c.campaignId)));

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
    campaigns: relevantCampaigns,
  };
}

/** Build the user message containing this tenant's data for the report. */
export function buildDailyReportUserMessage(ctx: ReportContext): string {
  // Context block — model reads it but never quotes verbatim. Kept in
  // English so it doesn't bias the model toward Thai output for non-Thai
  // users and so prompt caching shares one entry across locales.
  const lines: string[] = [];
  lines.push(`Workspace: ${ctx.tenantName}`);
  lines.push(`Report date: ${ctx.dateLabel}`);
  if (ctx.scopeName) {
    // Make the scope unmissable so the AI doesn't accidentally talk
    // about "everything" when the user only wanted one client.
    lines.push(`🎯 SCOPE: ${ctx.scopeName} (this report is for THIS scope only — do not reference accounts/campaigns outside it)`);
  }
  lines.push("");

  lines.push("=== Summary (current report date) ===");
  lines.push(JSON.stringify(ctx.today.summary, null, 2));
  lines.push("");

  if (ctx.prevDay) {
    lines.push("=== Summary (previous day, for comparison) ===");
    lines.push(JSON.stringify(ctx.prevDay.summary, null, 2));
    lines.push("");
  }

  // Pull objective breakdown from the resolved goals across all campaigns —
  // gives the AI a fast at-a-glance view before it dives into per-account
  // data.
  const objectiveCounts = new Map<string, number>();
  let unresolved = 0;
  for (const [, g] of ctx.goalsByCampaignId) {
    if (!g.resolved || !g.objective) {
      unresolved++;
      continue;
    }
    objectiveCounts.set(g.objective, (objectiveCounts.get(g.objective) ?? 0) + 1);
  }
  lines.push("=== Goal breakdown (campaigns by resolved objective) ===");
  lines.push(
    JSON.stringify(
      {
        byObjective: Object.fromEntries(objectiveCounts),
        unresolved,
      },
      null,
      2,
    ),
  );
  lines.push("");

  // Include only accounts with activity OR campaigns with activity. Cap
  // to the top 50 by spend to bound prompt size.
  const relevantAccounts = ctx.today.accounts
    .filter((a) => a.spend > 0 || a.impressions > 0 || a.campaigns.some((c) => c.spend > 0))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 50)
    .map((a) => slimAccount(a, ctx.goalsByCampaignId));

  lines.push(`=== Per-account / per-campaign (${relevantAccounts.length} accounts) ===`);
  lines.push(JSON.stringify(relevantAccounts, null, 2));

  return lines.join("\n");
}
