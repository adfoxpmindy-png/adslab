"use server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { analyzeAdCreativeTool } from "@/lib/ai/tools/analyze-ad-creative";

const DAILY_QUOTA = 50;

export type AnalyzeCreativeActionResult =
  | {
      ok: true;
      cached: boolean;
      cachedAt?: string;
      analysis: {
        hook: string;
        visualHierarchy: number;
        textLegibility: number;
        emotionalTone: string;
        dominantColor: string;
        strengths: string[];
        weaknesses: string[];
        suggestedFixes: string[];
      };
    }
  | { ok: false; error: string; message?: string };

/**
 * Thin wrapper around analyzeAdCreativeTool's handler so UI components can
 * call it directly. Auth + tenant resolution happen here; tool handler
 * stays the single source of truth for cache, quota, and Meta fetch.
 */
export async function analyzeAdCreativeAction(
  tenantSlug: string,
  adId: string,
): Promise<AnalyzeCreativeActionResult> {
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const result = await analyzeAdCreativeTool.handler(
    { adId },
    {
      tenantId: tenant.id,
      userId: session.userId,
      // No conversation context — this call originates from a UI button,
      // not an AI chat turn. Use a stable synthetic id so any downstream
      // audit logging doesn't get confused with a real conversation.
      conversationId: `ui-vision-${tenant.id}`,
    },
  );

  if ("error" in result && typeof result.error === "string") {
    const msg =
      "message" in result && typeof result.message === "string"
        ? result.message
        : undefined;
    return msg === undefined
      ? { ok: false, error: result.error }
      : { ok: false, error: result.error, message: msg };
  }
  return {
    ok: true,
    cached: result.cached,
    cachedAt: "cachedAt" in result ? result.cachedAt : undefined,
    analysis: result.analysis as AnalyzeCreativeActionResult extends { ok: true; analysis: infer A }
      ? A
      : never,
  };
}

export async function getVisionQuotaRemaining(tenantSlug: string): Promise<number> {
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const used = await prisma.metaAd.count({
    where: {
      creativeAnalyzedAt: { gte: since },
      adSet: {
        campaign: {
          connection: { tenantId: tenant.id },
        },
      },
    },
  });
  return Math.max(0, DAILY_QUOTA - used);
}
