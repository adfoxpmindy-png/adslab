import type { GoalKpi, GoalObjective } from "@/generated/prisma/enums";
import type { ParsedCampaignInsight } from "@/lib/meta/insights";

/**
 * For each objective we pick ONE primary KPI + a comparator + a default
 * target. Users can override the target per campaign, but the KPI
 * direction stays the same (e.g. CPM is always "lower is better").
 *
 * Targets are chosen for the Thai market based on industry benchmarks
 * the founder works with. They are deliberately reachable — they're
 * meant to flag genuinely off-track campaigns, not punish good ones.
 */
type Comparator = "lte" | "gte";

type ObjectiveSpec = {
  kpi: GoalKpi;
  comparator: Comparator;
  defaultTarget: number;
  /** Unit/label for display. */
  unit: "thb" | "ratio" | "percent";
};

export const OBJECTIVE_SPECS: Record<GoalObjective, ObjectiveSpec> = {
  AWARENESS: { kpi: "CPM", comparator: "lte", defaultTarget: 50, unit: "thb" },
  ENGAGEMENT: { kpi: "CTR", comparator: "gte", defaultTarget: 1.5, unit: "percent" },
  TRAFFIC: { kpi: "CPC", comparator: "lte", defaultTarget: 5, unit: "thb" },
  // Leads have no universal default — depends on industry margin. We
  // pick CPL with a soft target of ฿80 (acceptable for many SMBs) but
  // expect users to override.
  LEADS: { kpi: "CPL", comparator: "lte", defaultTarget: 80, unit: "thb" },
  SALES: { kpi: "ROAS", comparator: "gte", defaultTarget: 2.5, unit: "ratio" },
  APP_PROMOTION: { kpi: "CPA", comparator: "lte", defaultTarget: 50, unit: "thb" },
  STORE_VISITS: { kpi: "CPM", comparator: "lte", defaultTarget: 50, unit: "thb" },
};

export type EvaluationStatus = "on-track" | "off-track" | "no-data";

export type CampaignEvaluation = {
  kpi: GoalKpi;
  comparator: Comparator;
  target: number;
  /** Raw measured value, in the KPI's natural unit. */
  actual: number;
  status: EvaluationStatus;
  /** Whether `target` is the per-campaign override (true) or the default (false). */
  customTarget: boolean;
};

/** Compute the actual value for a given KPI from a campaign insight. */
function actualForKpi(kpi: GoalKpi, insight: ParsedCampaignInsight): number | null {
  switch (kpi) {
    case "ROAS":
      return insight.spend > 0 ? insight.roas : null;
    case "CPM":
      return insight.impressions > 0 ? insight.cpm : null;
    case "CTR":
      return insight.impressions > 0 ? insight.ctr : null;
    case "CPC":
      return insight.clicks > 0 ? insight.cpc : null;
    case "CPL":
      return insight.conversions > 0 ? insight.spend / insight.conversions : null;
    case "CPA":
      return insight.conversions > 0 ? insight.spend / insight.conversions : null;
    case "REACH":
      // We don't fetch reach yet — treat as no-data
      return null;
    case "FREQUENCY":
      return null;
    case "CONVERSIONS":
      return insight.conversions;
    case "ENGAGEMENT_RATE":
      return insight.impressions > 0 ? (insight.clicks / insight.impressions) * 100 : null;
  }
}

/**
 * Evaluate a campaign against its resolved goal. Returns null when:
 *   - the goal is unresolved (caller should not call us in that case)
 *   - the campaign has no data for the relevant KPI (e.g. zero spend)
 *
 * Otherwise the result tells the UI / AI whether the campaign is hitting
 * its target.
 */
export function evaluateCampaign(params: {
  objective: GoalObjective;
  primaryKpi: GoalKpi | null;
  primaryTarget: number | null;
  insight: ParsedCampaignInsight;
}): CampaignEvaluation | null {
  const spec = OBJECTIVE_SPECS[params.objective];
  const kpi = params.primaryKpi ?? spec.kpi;
  const target = params.primaryTarget ?? spec.defaultTarget;
  const comparator = spec.comparator;
  const customTarget = params.primaryTarget !== null;

  const actual = actualForKpi(kpi, params.insight);
  if (actual === null) {
    return {
      kpi,
      comparator,
      target,
      actual: 0,
      status: "no-data",
      customTarget,
    };
  }

  const status: EvaluationStatus =
    comparator === "lte" ? (actual <= target ? "on-track" : "off-track") : (actual >= target ? "on-track" : "off-track");

  return { kpi, comparator, target, actual, status, customTarget };
}

/**
 * Format a KPI value with its unit, for display. Uses Thai-style number
 * formatting and the right precision per KPI.
 */
export function formatKpi(kpi: GoalKpi, value: number): string {
  switch (kpi) {
    case "ROAS":
      return `${value.toFixed(2)}x`;
    case "CTR":
    case "ENGAGEMENT_RATE":
      return `${value.toFixed(2)}%`;
    case "CPM":
    case "CPC":
    case "CPL":
    case "CPA":
      return `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
    case "CONVERSIONS":
    case "REACH":
      return value.toLocaleString("th-TH");
    case "FREQUENCY":
      return value.toFixed(2);
  }
}

export function kpiLabel(kpi: GoalKpi): string {
  return kpi;
}

export function comparatorLabel(comparator: Comparator): string {
  return comparator === "lte" ? "≤" : "≥";
}
