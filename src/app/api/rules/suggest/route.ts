/**
 * POST /api/rules/suggest — AI proposes ≤3 candidate rules.
 *
 * Looks at:
 *   - Tenant's most recent manual pause actions from CampaignActionLog
 *   - Aggregated 30-day metrics (avg CPV, CTR, spend) across ad accounts
 *
 * Returns candidate Rule shapes the user can accept (which triggers
 * POST /api/rules with the candidate's payload). No persistence here.
 */
import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { aiChat } from "@/lib/ai/openrouter";
import { searchKnowledge } from "@/lib/ai/rag";
import type { RuleAction, RuleCondition } from "@/lib/rules/types";

type Candidate = {
  name: string;
  condition: RuleCondition;
  action: RuleAction;
  rationale: string;
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  // Recent manual pauses on this tenant — the strongest signal of what
  // a human would have automated.
  const recentPauses = await prisma.campaignActionLog.findMany({
    where: {
      tenantId: tenant.id,
      action: "PAUSE",
      result: "SUCCESS",
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { createdAt: true, errorMessage: true },
  });

  // Ground suggestions in expert wisdom from the system knowledge base
  // (Nick Theriot + Nattawut Puphet). Best-effort — if the corpus is
  // empty, suggestions still work, just less grounded.
  let knowledgeContext = "";
  try {
    const chunks = await searchKnowledge(
      tenant.id,
      "when should you pause a Facebook ad set automatically based on CPV or ROAS",
      3,
    );
    if (chunks.length > 0) {
      knowledgeContext =
        "\n\nExpert wisdom you can reference when crafting rules:\n" +
        chunks
          .map(
            (c, i) =>
              `[${i + 1}] (from "${c.documentTitle}") ${c.content.slice(0, 400)}…`,
          )
          .join("\n");
    }
  } catch {
    // Optional grounding — ignore failures
  }

  const candidates = await callAiForCandidates({
    pauseCount: recentPauses.length,
    pauseSamples: recentPauses.slice(0, 5).map((p) => ({
      reason: p.errorMessage ?? "(no annotation)",
      pausedAt: p.createdAt.toISOString().slice(0, 10),
    })),
    knowledgeContext,
  });

  return NextResponse.json({ candidates });
}

/**
 * Ask the analysis model for 3 candidate rules. We constrain the
 * response to a strict JSON schema to keep the parser deterministic.
 */
async function callAiForCandidates(stats: {
  pauseCount: number;
  pauseSamples: Array<{ reason: string; pausedAt: string }>;
  knowledgeContext?: string;
}): Promise<Candidate[]> {
  const systemPrompt = `You suggest Meta-ad auto-rules for a Thai media-buying agency.
Output EXACTLY a JSON object: { "candidates": Candidate[] } with 3 items.
Candidate schema: { name: string (Thai or English, <60 chars), condition: { metric: "cpv"|"roas"|"spend"|"frequency"|"ctr", op: "gt"|"lt"|"gte"|"lte", value: number, windowHours: 1|2|6|24, scope: "adset"|"campaign" }, action: "pause_adset"|"pause_campaign"|"notify_email"|"notify_in_app", rationale: string (Thai, 1-2 sentences, ≤200 chars) }

If tenant has manual pause history, propose at least one rule that mirrors what they were doing manually.
Skew conservative — defaults should rarely false-positive. For thresholds, use round numbers (฿5, ฿10, not ฿4.73).
For zero-history tenants, suggest universally safe rules (spend overage, frequency cap).`;

  const userMessage = `Tenant stats (last 30 days):
- Manual pause events: ${stats.pauseCount}
- Pause samples: ${JSON.stringify(stats.pauseSamples)}
${stats.knowledgeContext ?? ""}

Return 3 candidate rules now as JSON.`;

  const res = await aiChat({
    role: "analysis",
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    temperature: 0.3,
  });
  // The model may wrap the JSON in markdown — strip code fences first.
  const cleaned = res.content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { candidates?: Candidate[] };
    return (parsed.candidates ?? []).slice(0, 3);
  } catch {
    return [];
  }
}

export const runtime = "nodejs";
export const maxDuration = 30;
