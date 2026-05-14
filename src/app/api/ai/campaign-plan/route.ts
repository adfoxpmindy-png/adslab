import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { aiChat } from "@/lib/ai/openrouter";
import { generateCreativeImage } from "@/lib/ai/image-gen";

/**
 * Generate an AI campaign plan from a minimal brief. Returns a structured
 * plan with predicted KPIs + ad-set targeting + creative concepts that
 * the AI Campaign Builder page renders as a preview.
 *
 * The model used is the analysis model (Claude Sonnet) — its judgment on
 * targeting + creative ideation is dramatically better than Gemini Flash.
 */

const RequestSchema = z.object({
  tenantSlug: z.string(),
  product: z.string().min(3).max(500),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  objective: z.enum(["awareness", "traffic", "engagement", "leads", "conversions", "sales"]),
  dailyBudgetThb: z.number().int().min(50).max(1_000_000),
  durationDays: z.number().int().min(1).max(90),
  features: z.array(z.string()).max(20).optional(),
  message: z.string().max(500).optional(),
});

export type CampaignPlanResponse = {
  campaignName: string;
  predictions: {
    roas: number;
    cpaTHB: number;
    conversions: number;
    salesTHB: number;
  };
  adSets: Array<{
    name: string;
    audienceLabel: string;
    audienceDesc: string;
    interests: string[];
    budgetPercent: number;
    expectedRoas: number;
    expectedCpaTHB: number;
  }>;
  creatives: Array<{
    headline: string;
    description: string;
    type: "image" | "video";
    expectedCtr: number;
    /** AI-generated preview image URL (added server-side after plan) */
    imageUrl?: string;
  }>;
};

const SYSTEM_PROMPT = `คุณคือ AI media buyer ที่ช่วยวางแผนแคมเปญ Meta ads. ต้องตอบเป็น JSON เท่านั้น (no markdown, no commentary).

ภาษาที่ใช้ใน field ค่าๆ: ภาษาไทย ทั้งหมด ยกเว้น metric numbers

Output schema (ห้ามเปลี่ยน key หรือ shape):
{
  "campaignName": "ชื่อแคมเปญ (ภาษาไทย ใส่ objective ต่อท้าย เช่น Sunscreen Brightening - Conversions)",
  "predictions": {
    "roas": 4.3, // float
    "cpaTHB": 245, // int
    "conversions": 128, // int
    "salesTHB": 32580 // int
  },
  "adSets": [3-5 ad sets] each: {
    "name": "ชื่อ Ad Set",
    "audienceLabel": "เช่น ผู้หญิง 18-24 ปี - ความงาม",
    "audienceDesc": "ผู้หญิง 18-24",
    "interests": ["สนใจ: สกินแคร์", "ความงาม", "ทำเล็บ"],
    "budgetPercent": 40, // % of total daily budget
    "expectedRoas": 4.85,
    "expectedCpaTHB": 210
  },
  "creatives": [3-6 creatives] each: {
    "headline": "ข้อความสั้น 5-10 คำ",
    "description": "concept สั้นๆ ของภาพ/วิดีโอ",
    "type": "image" | "video",
    "expectedCtr": 2.45 // %
  }
}

หลักการ:
- predictions ต้องสมเหตุสมผลกับ budget + objective
- adSets ต้องแบ่ง budgetPercent รวมเป็น 100
- adSets ควรครอบคลุม audience หลายกลุ่ม (อย่าทับซ้อนกันมาก)
- creatives ควรหลากหลาย (อย่างน้อย 1 video, 1 image)
- คำพูดต้องเป็นภาษาไทยธรรมชาติ ไม่แปลตรงๆ`;

export async function POST(req: Request) {
  const session = await requireSession();
  const body = RequestSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_input", details: body.error.issues },
      { status: 400 },
    );
  }

  await requireTenantMember(body.data.tenantSlug);

  const userPrompt = buildUserPrompt(body.data);

  try {
    const result = await aiChat({
      role: "analysis",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.7,
    });

    // Extract JSON from possible markdown fence
    let jsonText = result.content.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonText = fenceMatch[1];

    const plan = JSON.parse(jsonText) as CampaignPlanResponse;

    // Attach AI-generated creative image URLs (pollinations.ai — lazy load
    // from the browser, so no server round-trip cost here).
    for (const c of plan.creatives) {
      const img = generateCreativeImage({
        headline: c.headline,
        description: c.description,
        type: c.type,
        productContext: body.data.product,
      });
      c.imageUrl = img.url;
    }

    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    console.error("[ai/campaign-plan]", err);
    return NextResponse.json(
      { error: "ai_failure", message: (err as Error).message },
      { status: 502 },
    );
  }
  void session;
}

function buildUserPrompt(input: z.infer<typeof RequestSchema>): string {
  const lines = [
    `สินค้า/บริการที่ขาย: ${input.product}`,
    input.websiteUrl ? `ลิงก์: ${input.websiteUrl}` : null,
    `เป้าหมายแคมเปญ: ${objectiveLabel(input.objective)}`,
    `งบประมาณต่อวัน: ${input.dailyBudgetThb.toLocaleString("th-TH")} บาท`,
    `ระยะเวลาแคมเปญ: ${input.durationDays} วัน`,
    input.features?.length ? `จุดเด่นสินค้า: ${input.features.join(", ")}` : null,
    input.message ? `ข้อความที่ต้องการสื่อ: ${input.message}` : null,
  ].filter(Boolean);
  return [
    "ช่วยวางแผนแคมเปญ Meta ads สำหรับธุรกิจนี้:",
    "",
    ...lines,
    "",
    "ตอบกลับเป็น JSON เท่านั้นตาม schema ที่กำหนดใน system prompt",
  ].join("\n");
}

function objectiveLabel(obj: string): string {
  const labels: Record<string, string> = {
    awareness: "Brand Awareness (สร้างการรับรู้)",
    traffic: "Traffic (เพิ่ม traffic ไปยังเว็บไซต์)",
    engagement: "Engagement (เพิ่ม interaction)",
    leads: "Lead Generation (เก็บ leads)",
    conversions: "Conversions (เพิ่ม conversion ในเว็บไซต์)",
    sales: "Sales (เพิ่มยอดขาย)",
  };
  return labels[obj] ?? obj;
}
