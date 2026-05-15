/**
 * /api/rules/[id]/runs — history of evaluations for a rule.
 *
 * Used by the rule-history drawer in the UI. Any tenant role can read.
 */
import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const { tenant } = await requireTenantMember(tenantSlug);

  // Verify rule belongs to tenant before returning runs.
  const rule = await prisma.autoRule.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });

  const runs = await prisma.autoRuleRun.findMany({
    where: { ruleId: id },
    orderBy: { tickAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ runs });
}

export const runtime = "nodejs";
