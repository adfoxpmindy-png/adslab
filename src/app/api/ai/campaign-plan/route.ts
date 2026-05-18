import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { aiChat } from "@/lib/ai/openrouter";
import { generateCreativeImage } from "@/lib/ai/image-gen";
import { resolveUserLocale } from "@/lib/i18n/server";
import { localeDirective } from "@/lib/i18n/prompt";

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

const SYSTEM_PROMPT_BASE = `You are an AI media buyer that helps plan Meta ads campaigns. Respond with JSON only (no markdown, no commentary).

{{LOCALE_DIRECTIVE}}

Language for string field values: follow the language specified above, except for metric numbers.

Output schema (do NOT change keys or shape):
{
  "campaignName": "Campaign name (in the user's language; append the objective, e.g. Sunscreen Brightening - Conversions)",
  "predictions": {
    "roas": 4.3, // float
    "cpaTHB": 245, // int
    "conversions": 128, // int
    "salesTHB": 32580 // int
  },
  "adSets": [3-5 ad sets] each: {
    "name": "Ad Set name",
    "audienceLabel": "e.g. Women 18-24 - Beauty",
    "audienceDesc": "Women 18-24",
    "interests": ["Interest: skincare", "beauty", "nail care"],
    "budgetPercent": 40, // % of total daily budget
    "expectedRoas": 4.85,
    "expectedCpaTHB": 210
  },
  "creatives": [3-6 creatives] each: {
    "headline": "Short copy, 5-10 words",
    "description": "Brief concept for the image/video",
    "type": "image" | "video",
    "expectedCtr": 2.45 // %
  }
}

Rules:
- predictions must be realistic given the budget + objective
- adSets budgetPercent values must sum to 100
- adSets should cover multiple audience segments (avoid heavy overlap)
- creatives should be varied (at least 1 video and 1 image)
- copy must sound natural in the user's language (per the locale directive above), not a literal translation`;

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

  const locale = await resolveUserLocale(session.userId);
  const userPrompt = buildUserPrompt(body.data);

  try {
    const result = await aiChat({
      role: "analysis",
      system: SYSTEM_PROMPT_BASE.replace("{{LOCALE_DIRECTIVE}}", localeDirective(locale)),
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
    `Product/service sold: ${input.product}`,
    input.websiteUrl ? `Link: ${input.websiteUrl}` : null,
    `Campaign objective: ${objectiveLabel(input.objective)}`,
    `Daily budget: ${input.dailyBudgetThb.toLocaleString("en-US")} THB`,
    `Campaign duration: ${input.durationDays} days`,
    input.features?.length ? `Product highlights: ${input.features.join(", ")}` : null,
    input.message ? `Message to convey: ${input.message}` : null,
  ].filter(Boolean);
  return [
    "Help plan a Meta ads campaign for this business:",
    "",
    ...lines,
    "",
    "Respond with JSON only, following the schema defined in the system prompt.",
  ].join("\n");
}

function objectiveLabel(obj: string): string {
  const labels: Record<string, string> = {
    awareness: "Brand Awareness (build recognition)",
    traffic: "Traffic (drive traffic to the website)",
    engagement: "Engagement (increase interactions)",
    leads: "Lead Generation (collect leads)",
    conversions: "Conversions (drive on-site conversions)",
    sales: "Sales (drive purchases)",
  };
  return labels[obj] ?? obj;
}
