import { prisma } from "@/lib/prisma";
import { getDashboardData, filterDashboardPayload } from "@/lib/meta/dashboard-service";
import type { DateRangeKey } from "@/lib/meta/insights";
import { getEffectiveScope } from "@/lib/tenant-scope";

import type {
  FunnelStage,
  JourneyEdge,
  JourneyGraph,
  JourneyNode,
} from "./types";

/**
 * Build a customer-journey graph for the tenant.
 *
 * v1 strategy (no Meta API enrichment yet):
 *   - Source data: MetaCampaign rows + cached insights for spend/perf
 *   - Group campaigns by funnel stage derived from their objective
 *   - Each campaign becomes one "post"-shaped node so the canvas has
 *     something to render. Real post thumbnails arrive in v2 once we
 *     wire batched creative fetches.
 *   - Each campaign points to a Conversion goal node corresponding to
 *     its objective (Sales → Purchase island, Leads → Lead island, etc.)
 *
 * Modes:
 *   - "overview":  all campaigns in scope, conversion islands are shared
 *                  across campaigns of the same objective
 *   - "drilldown": filtered to a single campaign id — same structure but
 *                  with just that campaign's ads/conversions visible
 */

export type ExtractInput = {
  tenantId: string;
  userId: string;
  range: DateRangeKey;
  mode: "overview" | "drilldown";
  /** Required when mode === "drilldown". Meta campaign id. */
  drillCampaignId?: string;
};

export async function extractJourney(input: ExtractInput): Promise<JourneyGraph> {
  const scope = await getEffectiveScope(input.userId, input.tenantId);

  // Pull cached dashboard payload — gives us per-campaign spend + KPIs
  // already aggregated, no extra Meta API call needed in the hot path.
  let payload;
  try {
    const result = await getDashboardData(input.tenantId, input.range);
    payload = filterDashboardPayload(result.payload, scope.accountIds);
  } catch {
    return emptyGraph();
  }

  // Flatten to per-campaign rows (with account context preserved)
  const campaignRows: Array<{
    campaignId: string;
    campaignName: string;
    metaObjective: string | null;
    spendThb: number;
    impressions: number;
    clicks: number;
    conversions: number;
    purchaseValue: number;
    accountId: string;
  }> = [];
  for (const account of payload.accounts) {
    for (const c of account.campaigns) {
      if (input.mode === "drilldown" && c.campaignId !== input.drillCampaignId) {
        continue;
      }
      if (scope.campaignIds !== null && !scope.campaignIds.includes(c.campaignId)) {
        continue;
      }
      campaignRows.push({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        metaObjective: c.metaObjective ?? null,
        spendThb: c.spend, // already converted in dashboard-service
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
        purchaseValue: c.purchaseValue,
        accountId: account.accountId,
      });
    }
  }

  if (campaignRows.length === 0) return emptyGraph();

  // Build nodes
  const nodes: JourneyNode[] = [];
  const edges: JourneyEdge[] = [];
  const conversionNodeByKey = new Map<string, JourneyNode>();
  let totalSpend = 0;

  for (const c of campaignRows) {
    totalSpend += c.spendThb;
    const stage = stageForObjective(c.metaObjective);
    const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;

    // Campaign-as-post node — placeholder thumbnail until v2 fetches the
    // real creative image. The "post" kind keeps the visual story
    // consistent ("island = a thing the user sees in feed").
    const postNode: JourneyNode = {
      id: `post:${c.campaignId}`,
      kind: "post",
      label: c.campaignName,
      postId: c.campaignId,
      pageId: null,
      thumbnailUrl: null,
      reach: c.impressions,
      ctr,
      stage,
      campaignIds: [c.campaignId],
    };
    nodes.push(postNode);

    // Conversion island — keyed so multiple campaigns share the same
    // destination island in Overview mode.
    const conversionKey = conversionKeyForObjective(c.metaObjective);
    let conversionNode = conversionNodeByKey.get(conversionKey);
    if (!conversionNode) {
      conversionNode = {
        id: `conv:${conversionKey}`,
        kind: "conversion",
        label: conversionLabel(conversionKey),
        customConversionId: null,
        eventType: conversionKey,
        fires: 0,
        stage: "conversion",
      };
      conversionNodeByKey.set(conversionKey, conversionNode);
      nodes.push(conversionNode);
    }
    // Mutably accumulate conversion count + spend on the shared node
    if (conversionNode.kind === "conversion") {
      conversionNode.fires += c.conversions;
    }

    edges.push({
      id: `e:${c.campaignId}->${conversionKey}`,
      source: postNode.id,
      target: conversionNode.id,
      spend: c.spendThb,
      count: c.conversions > 0 ? c.conversions : null,
      stage,
    });
  }

  return {
    nodes,
    edges,
    totalSpendThb: totalSpend,
    generatedAt: Date.now(),
  };
}

function emptyGraph(): JourneyGraph {
  return { nodes: [], edges: [], totalSpendThb: 0, generatedAt: Date.now() };
}

function stageForObjective(obj: string | null): FunnelStage {
  switch (obj) {
    case "OUTCOME_AWARENESS":
    case "BRAND_AWARENESS":
    case "REACH":
      return "awareness";
    case "OUTCOME_ENGAGEMENT":
    case "OUTCOME_TRAFFIC":
    case "TRAFFIC":
    case "ENGAGEMENT":
    case "VIDEO_VIEWS":
      return "consideration";
    case "OUTCOME_LEADS":
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "LEAD_GENERATION":
    case "MESSAGES":
      return "conversion";
    default:
      return "consideration";
  }
}

function conversionKeyForObjective(obj: string | null): string {
  switch (obj) {
    case "OUTCOME_SALES":
    case "CONVERSIONS":
      return "PURCHASE";
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "LEAD";
    case "OUTCOME_ENGAGEMENT":
      return "ENGAGEMENT";
    case "OUTCOME_AWARENESS":
    case "BRAND_AWARENESS":
    case "REACH":
      return "REACH";
    case "OUTCOME_TRAFFIC":
    case "TRAFFIC":
      return "LINK_CLICK";
    case "MESSAGES":
      return "MESSAGES";
    default:
      return "ENGAGEMENT";
  }
}

function conversionLabel(key: string): string {
  switch (key) {
    case "PURCHASE":
      return "Purchase";
    case "LEAD":
      return "Lead";
    case "ENGAGEMENT":
      return "Engagement";
    case "REACH":
      return "Reach";
    case "LINK_CLICK":
      return "Link Click";
    case "MESSAGES":
      return "Messages";
    default:
      return key;
  }
}

void prisma; // referenced for future creative-fetch enrichment
