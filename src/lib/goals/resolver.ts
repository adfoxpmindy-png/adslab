import { prisma } from "@/lib/prisma";
import type { GoalKpi, GoalObjective, GoalSource } from "@/generated/prisma/enums";
import { mapMetaObjective } from "./meta-objective-map";
import { matchNamingRule, type CompiledRule } from "./naming-match";

/**
 * Resolved goal for one campaign. The `source` tells the UI / AI prompt
 * how confident we are in the objective:
 *   USER_MANUAL    — user explicitly set it
 *   AUTO_NAME      — matched a NamingConvention pattern (Phase 1c)
 *   AUTO_META      — derived from Meta's own `objective` field
 *   TENANT_DEFAULT — fell through to the tenant default goal
 *
 * `resolved=false` means we could not assign any goal (and there is no
 * tenant default). The AI should explicitly flag this — not guess.
 */
export type ResolvedGoal = {
  resolved: boolean;
  objective: GoalObjective | null;
  source: GoalSource | null;
  /** Custom primary KPI when the user overrode the default. Null = use objective default. */
  primaryKpi: GoalKpi | null;
  /** Custom primary target. Null = use the default for the KPI. */
  primaryTarget: number | null;
};

type CampaignInput = {
  /** Meta's campaign id (string of digits) */
  metaCampaignId: string;
  /** Meta campaign name — used by Layer 2 (naming) */
  name: string;
  /** Raw Meta objective string. Null if Meta omitted it. */
  metaObjective: string | null;
};

/**
 * Resolve goals for many campaigns in one shot. We batch the DB lookups
 * (manual goals + tenant default + naming rules) so the per-campaign
 * loop stays O(1) — important because a tenant can have 800+ campaigns.
 *
 * Resolution order:
 *   USER_MANUAL > AUTO_NAME > AUTO_META > TENANT_DEFAULT > unresolved
 *
 * Manual wins because the user explicitly said so. Naming wins over
 * Meta because Meta's `objective` is often stale (the user re-purposed
 * a campaign without renaming the objective). Meta wins over tenant
 * default because Meta is more specific than a workspace-wide fallback.
 */
export async function resolveCampaignGoals(params: {
  tenantId: string;
  campaigns: CampaignInput[];
}): Promise<Map<string, ResolvedGoal>> {
  const { tenantId, campaigns } = params;
  const out = new Map<string, ResolvedGoal>();
  if (campaigns.length === 0) return out;

  // 1. Pull our internal MetaCampaign rows in one query so we can map
  //    Meta campaign id → our row id (which is what CampaignGoal FKs to).
  const metaCampaignIds = campaigns.map((c) => c.metaCampaignId);
  const internalCampaigns = await prisma.metaCampaign.findMany({
    where: { metaCampaignId: { in: metaCampaignIds } },
    select: { id: true, metaCampaignId: true },
  });
  const internalIdByMeta = new Map(
    internalCampaigns.map((c) => [c.metaCampaignId, c.id]),
  );

  // 2. Pull every per-campaign goal for this tenant in one query.
  const internalIds = internalCampaigns.map((c) => c.id);
  const goals = internalIds.length
    ? await prisma.campaignGoal.findMany({
        where: { tenantId, campaignId: { in: internalIds } },
        select: {
          campaignId: true,
          objective: true,
          source: true,
          primaryKpi: true,
          primaryTarget: true,
        },
      })
    : [];
  const goalByInternalId = new Map(
    goals.filter((g) => g.campaignId).map((g) => [g.campaignId as string, g]),
  );

  // 3. Pull the tenant default (CampaignGoal with campaignId=null).
  //    There can be at most one — we just take the most recent.
  const tenantDefault = await prisma.campaignGoal.findFirst({
    where: { tenantId, campaignId: null },
    orderBy: { updatedAt: "desc" },
    select: { objective: true },
  });

  // 4. Pull naming-convention rules once and pre-compile them so the
  //    per-campaign loop stays fast even with hundreds of campaigns.
  const namingRules = await prisma.namingConvention.findMany({
    where: { tenantId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: { pattern: true, isRegex: true, objective: true },
  });
  const compiledRules: CompiledRule[] = [];
  for (const r of namingRules) {
    if (r.isRegex) {
      try {
        compiledRules.push({
          matcher: new RegExp(r.pattern, "i"),
          objective: r.objective,
        });
      } catch {
        // Skip a bad rule rather than crash the whole report.
      }
    } else {
      compiledRules.push({
        matcher: r.pattern.toLowerCase(),
        objective: r.objective,
      });
    }
  }

  // 5. Resolve each campaign in priority order.
  for (const c of campaigns) {
    const internalId = internalIdByMeta.get(c.metaCampaignId);
    const manual = internalId ? goalByInternalId.get(internalId) : undefined;
    if (manual) {
      out.set(c.metaCampaignId, {
        resolved: true,
        objective: manual.objective,
        source: manual.source,
        primaryKpi: manual.primaryKpi,
        primaryTarget: manual.primaryTarget,
      });
      continue;
    }

    // Layer 2: naming convention match.
    const fromName = matchNamingRule(c.name, compiledRules);
    if (fromName) {
      out.set(c.metaCampaignId, {
        resolved: true,
        objective: fromName,
        source: "AUTO_NAME",
        primaryKpi: null,
        primaryTarget: null,
      });
      continue;
    }

    // Layer 1 (a.k.a. Layer 3 in priority): derive from Meta objective.
    const fromMeta = mapMetaObjective(c.metaObjective);
    if (fromMeta) {
      out.set(c.metaCampaignId, {
        resolved: true,
        objective: fromMeta,
        source: "AUTO_META",
        primaryKpi: null,
        primaryTarget: null,
      });
      continue;
    }

    // Tenant default fallback.
    if (tenantDefault) {
      out.set(c.metaCampaignId, {
        resolved: true,
        objective: tenantDefault.objective,
        source: "TENANT_DEFAULT",
        primaryKpi: null,
        primaryTarget: null,
      });
      continue;
    }

    out.set(c.metaCampaignId, {
      resolved: false,
      objective: null,
      source: null,
      primaryKpi: null,
      primaryTarget: null,
    });
  }

  return out;
}
