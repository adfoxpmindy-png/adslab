import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { resolveCampaignGoals } from "@/lib/goals/resolver";

const GOAL_OBJECTIVES = [
  "AWARENESS",
  "ENGAGEMENT",
  "TRAFFIC",
  "LEADS",
  "SALES",
  "APP_PROMOTION",
  "STORE_VISITS",
] as const;

const GOAL_KPIS = [
  "ROAS",
  "CPM",
  "CTR",
  "CPC",
  "CPL",
  "CPA",
  "REACH",
  "FREQUENCY",
  "CONVERSIONS",
  "ENGAGEMENT_RATE",
] as const;

const setGoalSchema = z.object({
  campaignId: z.string().min(1),
  objective: z.enum(GOAL_OBJECTIVES),
  primaryKpi: z.enum(GOAL_KPIS).nullable().optional(),
  primaryTarget: z.number().finite().min(0).nullable().optional(),
  notes: z.string().max(500).optional(),
});

const bulkSetSchema = z.object({
  campaignIds: z.array(z.string().min(1)).min(1).max(500),
  objective: z.enum(GOAL_OBJECTIVES),
});

/**
 * GET /api/goals?tenantSlug=<slug>
 *
 * Returns every MetaCampaign for the tenant's Meta connection, each with
 * its currently resolved goal (manual override > AUTO_META > tenant
 * default > unresolved). Used by the /goals page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const { tenant } = await requireTenantMember(tenantSlug);

  // Find the tenant's Meta connection so we can list its campaigns.
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!connection) {
    return NextResponse.json({ campaigns: [], connection: null });
  }

  const campaigns = await prisma.metaCampaign.findMany({
    where: { metaConnectionId: connection.id },
    orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
    select: {
      id: true,
      metaCampaignId: true,
      metaAccountId: true,
      name: true,
      metaObjective: true,
      effectiveStatus: true,
    },
  });

  // Resolve goals for every campaign. We re-use the same resolver the
  // report flow uses so the UI shows EXACTLY what the AI sees.
  const goals = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: campaigns.map((c) => ({
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      metaObjective: c.metaObjective,
    })),
  });

  // Fetch ad-account names so the UI can group by account.
  const accounts = await prisma.metaAdAccount.findMany({
    where: { metaConnectionId: connection.id },
    select: { metaAccountId: true, name: true, businessName: true },
  });
  const accountNameById = new Map(
    accounts.map((a) => [a.metaAccountId, { name: a.name, business: a.businessName }]),
  );

  return NextResponse.json({
    connection: { id: connection.id, status: connection.status },
    campaigns: campaigns.map((c) => {
      const account = accountNameById.get(c.metaAccountId);
      const goal = goals.get(c.metaCampaignId) ?? {
        resolved: false,
        objective: null,
        source: null,
      };
      return {
        id: c.id,
        metaCampaignId: c.metaCampaignId,
        name: c.name,
        metaObjective: c.metaObjective,
        effectiveStatus: c.effectiveStatus,
        account: {
          id: c.metaAccountId,
          name: account?.name ?? c.metaAccountId,
          business: account?.business ?? null,
        },
        goal,
      };
    }),
  });
}

/**
 * POST /api/goals?tenantSlug=<slug>
 *
 * Body: { campaignId, objective, notes? } — single override.
 *   OR  { campaignIds: string[], objective } — bulk override.
 *
 * Creates / updates the CampaignGoal row with source=USER_MANUAL.
 * OWNER + MEDIA_BUYER only.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const body = await request.json().catch(() => ({}));

  // Bulk path
  if (Array.isArray(body?.campaignIds)) {
    const parsed = bulkSetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const { campaignIds, objective } = parsed.data;

    // Verify the campaigns belong to this tenant (through MetaConnection).
    const owned = await prisma.metaCampaign.findMany({
      where: {
        id: { in: campaignIds },
        connection: { tenantId: tenant.id },
      },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((c) => c.id));
    if (ownedIds.size !== campaignIds.length) {
      return NextResponse.json(
        { error: "Some campaigns do not belong to this tenant" },
        { status: 403 },
      );
    }

    // Run upserts in a transaction so a partial bulk is never observed.
    await prisma.$transaction(
      campaignIds.map((cid) =>
        prisma.campaignGoal.upsert({
          where: { campaignId: cid },
          create: {
            tenantId: tenant.id,
            campaignId: cid,
            objective,
            source: "USER_MANUAL",
          },
          update: {
            objective,
            source: "USER_MANUAL",
          },
        }),
      ),
    );

    return NextResponse.json({ updated: campaignIds.length });
  }

  // Single path
  const parsed = setGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { campaignId, objective, primaryKpi, primaryTarget, notes } = parsed.data;

  const campaign = await prisma.metaCampaign.findFirst({
    where: { id: campaignId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const goal = await prisma.campaignGoal.upsert({
    where: { campaignId },
    create: {
      tenantId: tenant.id,
      campaignId,
      objective,
      primaryKpi: primaryKpi ?? null,
      primaryTarget: primaryTarget ?? null,
      source: "USER_MANUAL",
      notes,
    },
    update: {
      objective,
      // Explicitly accept null to clear an existing target. `undefined`
      // means "leave alone" — which matches Zod's missing-field handling.
      ...(primaryKpi !== undefined ? { primaryKpi } : {}),
      ...(primaryTarget !== undefined ? { primaryTarget } : {}),
      source: "USER_MANUAL",
      notes,
    },
  });

  return NextResponse.json({ goal });
}

/**
 * DELETE /api/goals?tenantSlug=<slug>&campaignId=<id>
 *
 * Remove a manual override. The campaign falls back to AUTO_META (or
 * naming / tenant default) on next resolve.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const campaignId = url.searchParams.get("campaignId");
  if (!tenantSlug || !campaignId) {
    return NextResponse.json(
      { error: "tenantSlug and campaignId required" },
      { status: 400 },
    );
  }

  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  // Verify ownership via the join chain.
  const goal = await prisma.campaignGoal.findFirst({
    where: { campaignId, tenantId: tenant.id, source: "USER_MANUAL" },
    select: { id: true },
  });
  if (!goal) {
    return NextResponse.json({ error: "Manual override not found" }, { status: 404 });
  }

  await prisma.campaignGoal.delete({ where: { id: goal.id } });
  return NextResponse.json({ ok: true });
}
