/**
 * POST /api/rules/[id]/run — manually trigger a single rule.
 *
 * Used by the "test this rule" button. Bypasses the throttle (the
 * user explicitly clicked) but still respects 24h cooldown for the
 * action — the test still writes a RuleRun row.
 *
 * Returns a summary of what happened across each target.
 */
import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { runTickForTenant } from "@/lib/rules/runner";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const rule = await prisma.autoRule.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, enabled: true },
  });
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Force evaluation by clearing throttle timestamp on JUST this rule.
  await prisma.autoRule.update({
    where: { id },
    data: { lastEvaluatedAt: null },
  });

  // For now: re-use the tenant-wide tick. Future optimisation: a
  // single-rule fast path. Tenant tick is cheap enough for a manual
  // button.
  const stats = await runTickForTenant(tenant.id);

  // Pull this rule's most-recent runs from this tick to surface in UI.
  const runs = await prisma.autoRuleRun.findMany({
    where: { ruleId: id },
    orderBy: { tickAt: "desc" },
    take: 10,
  });
  return NextResponse.json({ ok: true, stats, runs });
}

export const runtime = "nodejs";
export const maxDuration = 60;
