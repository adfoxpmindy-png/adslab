/**
 * Fetch the ad set + ad tree for a single Meta campaign, with insights
 * merged on every node. Used by the expandable campaigns table.
 *
 * The query is shaped as one nested Graph API call so we get 50 ad sets
 * + their ads + insights in a single round trip (instead of N+1).
 */
import { graphFetch } from "./graph-api";
import type { DateRangeKey } from "./insights";

type RawAction = { action_type: string; value: string };

type RawInsight = {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
};

type RawAd = {
  id: string;
  name?: string;
  effective_status?: string;
  configured_status?: string;
  creative?: { id?: string; thumbnail_url?: string };
  insights?: { data: RawInsight[] };
};

type RawAdSet = {
  id: string;
  name?: string;
  effective_status?: string;
  configured_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  end_time?: string;
  insights?: { data: RawInsight[] };
  ads?: { data: RawAd[] };
};

type RawCampaignWithTree = {
  id: string;
  name?: string;
  adsets?: { data: RawAdSet[] };
};

// =============================================================================
// Output types — consumed by the client component
// =============================================================================

export type StructureMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  purchaseValue: number;
  roas: number;
};

export type AdNode = {
  id: string;
  name: string;
  effectiveStatus: string;
  configuredStatus: string | null;
  creativeId: string | null;
  thumbnailUrl: string | null;
  metrics: StructureMetrics;
};

export type AdSetNode = {
  id: string;
  name: string;
  effectiveStatus: string;
  configuredStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  endTime: string | null;
  metrics: StructureMetrics;
  ads: AdNode[];
};

export type CampaignStructure = {
  campaignId: string;
  campaignName: string;
  adSets: AdSetNode[];
  fetchedAt: string;
};

// =============================================================================
// Parsing
// =============================================================================

const CONVERSION_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
]);
const PURCHASE_VALUE_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
]);

function num(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumActions(actions: RawAction[] | undefined, allowed: Set<string>): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (allowed.has(a.action_type)) total += num(a.value);
  }
  return total;
}

function parseMetrics(insight: RawInsight | undefined): StructureMetrics {
  const spend = num(insight?.spend);
  const purchaseValue = sumActions(insight?.action_values, PURCHASE_VALUE_ACTION_TYPES);
  const conversions = sumActions(insight?.actions, CONVERSION_ACTION_TYPES);
  return {
    spend,
    impressions: num(insight?.impressions),
    clicks: num(insight?.clicks),
    ctr: num(insight?.ctr),
    cpc: num(insight?.cpc),
    conversions,
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
  };
}

function parseAd(ad: RawAd): AdNode {
  return {
    id: ad.id,
    name: ad.name ?? "",
    effectiveStatus: ad.effective_status ?? "UNKNOWN",
    configuredStatus: ad.configured_status ?? null,
    creativeId: ad.creative?.id ?? null,
    thumbnailUrl: ad.creative?.thumbnail_url ?? null,
    metrics: parseMetrics(ad.insights?.data?.[0]),
  };
}

function parseAdSet(adset: RawAdSet): AdSetNode {
  return {
    id: adset.id,
    name: adset.name ?? "",
    effectiveStatus: adset.effective_status ?? "UNKNOWN",
    configuredStatus: adset.configured_status ?? null,
    dailyBudget:
      adset.daily_budget && adset.daily_budget !== "0" ? Number(adset.daily_budget) : null,
    lifetimeBudget:
      adset.lifetime_budget && adset.lifetime_budget !== "0"
        ? Number(adset.lifetime_budget)
        : null,
    optimizationGoal: adset.optimization_goal ?? null,
    billingEvent: adset.billing_event ?? null,
    endTime: adset.end_time ?? null,
    metrics: parseMetrics(adset.insights?.data?.[0]),
    ads: (adset.ads?.data ?? []).map(parseAd),
  };
}

// =============================================================================
// Range → API params (mirrors insights.ts)
// =============================================================================

const PRESET_KEYS = new Set(["today", "yesterday", "last_7d", "last_30d"]);

function rangeToInsightsParam(
  range: DateRangeKey,
): { date_preset?: string; time_range?: string } {
  if (PRESET_KEYS.has(range)) {
    return { date_preset: range };
  }
  if (range.startsWith("custom:")) {
    const dates = range.slice("custom:".length).split("..");
    if (dates.length === 2 && dates[0] && dates[1]) {
      return { time_range: JSON.stringify({ since: dates[0], until: dates[1] }) };
    }
  }
  return { date_preset: "last_30d" };
}

const INSIGHT_FIELDS = ["spend", "impressions", "clicks", "ctr", "cpm", "cpc", "actions", "action_values"].join(",");

// =============================================================================
// Public API
// =============================================================================

export async function fetchCampaignStructure(args: {
  campaignId: string;
  accessToken: string;
  range?: DateRangeKey;
}): Promise<CampaignStructure> {
  const range: DateRangeKey = args.range ?? "last_30d";
  const rangeParam = rangeToInsightsParam(range);
  const insightSubQuery = rangeParam.time_range
    ? `insights.time_range(${rangeParam.time_range}){${INSIGHT_FIELDS}}`
    : `insights.date_preset(${rangeParam.date_preset}){${INSIGHT_FIELDS}}`;

  // Limit to 50 ad sets per campaign, 50 ads per ad set — enough for the
  // overwhelming majority of campaigns. Hitting these limits is rare and
  // adds heavy pagination work for marginal value.
  const adsSubQuery =
    `ads.limit(50).filtering([{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED","ADSET_PAUSED","CAMPAIGN_PAUSED","DISAPPROVED","WITH_ISSUES"]}])` +
    `{id,name,effective_status,configured_status,creative{id,thumbnail_url},${insightSubQuery}}`;

  const adSetsSubQuery =
    `adsets.limit(50){id,name,effective_status,configured_status,daily_budget,lifetime_budget,optimization_goal,billing_event,end_time,${insightSubQuery},${adsSubQuery}}`;

  const fields = `id,name,${adSetsSubQuery}`;

  const raw = await graphFetch<RawCampaignWithTree>(`/${args.campaignId}`, {
    accessToken: args.accessToken,
    searchParams: { fields },
  });

  return {
    campaignId: raw.id,
    campaignName: raw.name ?? "",
    adSets: (raw.adsets?.data ?? []).map(parseAdSet),
    fetchedAt: new Date().toISOString(),
  };
}
