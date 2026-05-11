import { graphFetch } from "./graph-api";

/** Conversion actions we consider for the default "Conversions" metric. */
const CONVERSION_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
]);

/** Purchase actions used to compute ROAS revenue. */
const PURCHASE_VALUE_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
]);

export type DateRangeKey =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_30d"
  | `custom:${string}..${string}`;

/**
 * Distribution of active+paused campaign objectives on an ad account.
 * Lets the AI reason about WHY a metric pattern is acceptable —
 * a Reach campaign with low ROAS is fine; a Sales campaign with the
 * same number is a red flag.
 */
export type CampaignObjectiveCount = {
  /** Raw Meta value, e.g. `OUTCOME_SALES`, `OUTCOME_AWARENESS`, `REACH` */
  objective: string;
  count: number;
};

export type ParsedInsight = {
  accountId: string; // "act_xxxx"
  accountName: string;
  currency: string;
  businessName: string | null;
  accountStatus: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  frequency: number;
  conversions: number;
  purchaseValue: number;
  roas: number;
  /** Empty array if campaigns sub-query is not available. */
  campaignObjectives: CampaignObjectiveCount[];
};

export type DashboardSummary = {
  /** Spend converted to THB via the FX env vars; sum across all accounts. */
  spendThb: number;
  impressions: number;
  clicks: number;
  conversions: number;
  purchaseValueThb: number;
  roas: number;
  ctr: number;
  cpm: number;
};

export type DashboardPayload = {
  range: DateRangeKey;
  summary: DashboardSummary;
  accounts: ParsedInsight[];
  fetchedAt: string; // ISO
};

// -----------------------------------------------------------------------------
// Meta API → ParsedInsight transform
// -----------------------------------------------------------------------------

type RawAction = { action_type: string; value: string };

type RawInsight = {
  account_id?: string;
  account_currency?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  frequency?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
};

type RawCampaign = {
  id: string;
  name?: string;
  objective?: string;
  effective_status?: string;
};

type RawAccountWithInsights = {
  id: string; // "act_xxx"
  name: string;
  currency: string;
  account_status: number;
  business?: { id: string; name: string };
  insights?: { data: RawInsight[] };
  campaigns?: { data: RawCampaign[] };
};

type RawAccountsPage = {
  data: RawAccountWithInsights[];
  paging?: { next?: string };
};

function num(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumActionTypes(actions: RawAction[] | undefined, allowed: Set<string>): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (allowed.has(a.action_type)) total += num(a.value);
  }
  return total;
}

function summarizeObjectives(campaigns: RawCampaign[] | undefined): CampaignObjectiveCount[] {
  if (!campaigns || campaigns.length === 0) return [];
  const counts = new Map<string, number>();
  for (const c of campaigns) {
    if (!c.objective) continue;
    counts.set(c.objective, (counts.get(c.objective) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([objective, count]) => ({ objective, count }))
    .sort((a, b) => b.count - a.count);
}

export function parseInsight(account: RawAccountWithInsights): ParsedInsight {
  const insight = account.insights?.data?.[0];
  const spend = num(insight?.spend);
  const purchaseValue = sumActionTypes(insight?.action_values, PURCHASE_VALUE_ACTION_TYPES);
  const conversions = sumActionTypes(insight?.actions, CONVERSION_ACTION_TYPES);

  return {
    accountId: account.id,
    accountName: account.name,
    currency: account.currency ?? "THB",
    businessName: account.business?.name ?? null,
    accountStatus: account.account_status,
    spend,
    impressions: num(insight?.impressions),
    clicks: num(insight?.clicks),
    ctr: num(insight?.ctr),
    cpm: num(insight?.cpm),
    cpc: num(insight?.cpc),
    frequency: num(insight?.frequency),
    conversions,
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
    campaignObjectives: summarizeObjectives(account.campaigns?.data),
  };
}

// -----------------------------------------------------------------------------
// Range → Meta API params
// -----------------------------------------------------------------------------

const PRESET_KEYS = new Set(["today", "yesterday", "last_7d", "last_30d"]);

function rangeToInsightsParam(range: DateRangeKey): { date_preset?: string; time_range?: string } {
  if (PRESET_KEYS.has(range)) {
    return { date_preset: range };
  }
  if (range.startsWith("custom:")) {
    const dates = range.slice("custom:".length).split("..");
    if (dates.length === 2 && dates[0] && dates[1]) {
      return { time_range: JSON.stringify({ since: dates[0], until: dates[1] }) };
    }
  }
  // Fallback to last_7d if range is malformed
  return { date_preset: "last_7d" };
}

// -----------------------------------------------------------------------------
// Batch fetch
// -----------------------------------------------------------------------------

const INSIGHT_FIELDS = ["spend", "impressions", "clicks", "ctr", "cpm", "cpc", "frequency", "actions", "action_values"].join(",");

/**
 * Fetch insights for ALL of the user's ad accounts in one batched call
 * via `/me/adaccounts?fields=...,insights.date_preset(X){...}`.
 *
 * Returns one ParsedInsight per ad account the user can access.
 * Handles pagination if the user has more than 100 accounts.
 */
export async function fetchInsightsForAllAccounts(
  accessToken: string,
  range: DateRangeKey,
): Promise<ParsedInsight[]> {
  const rangeParam = rangeToInsightsParam(range);
  const insightSubQuery = rangeParam.time_range
    ? `insights.time_range(${rangeParam.time_range}){${INSIGHT_FIELDS}}`
    : `insights.date_preset(${rangeParam.date_preset}){${INSIGHT_FIELDS}}`;

  // Nested `campaigns` sub-query: pull active+paused campaigns with their
  // objective so the AI can evaluate metrics against intent (Reach vs Sales
  // need different judgement). Limit 50 per account keeps payload bounded.
  const campaignsSubQuery =
    'campaigns.limit(50).filtering([{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED","CAMPAIGN_PAUSED"]}]){id,name,objective,effective_status}';

  const fields = `id,name,currency,account_status,business{id,name},${insightSubQuery},${campaignsSubQuery}`;

  const results: ParsedInsight[] = [];
  let page = await graphFetch<RawAccountsPage>("/me/adaccounts", {
    accessToken,
    searchParams: { fields, limit: 100 },
  });
  for (const a of page.data) results.push(parseInsight(a));

  while (page.paging?.next) {
    const next = await fetch(page.paging.next);
    if (!next.ok) throw new Error(`Meta paging fetch failed: ${next.status}`);
    page = (await next.json()) as RawAccountsPage;
    for (const a of page.data) results.push(parseInsight(a));
  }

  return results;
}
