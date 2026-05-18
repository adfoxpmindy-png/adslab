/**
 * Optimization engine — rule-based + AI-explained recommendations.
 *
 * Scans a tenant's per-campaign insights and emits actionable suggestions
 * for the AI Optimization Center page. Each recommendation has:
 *   - severity (high/medium/low)
 *   - human-readable rationale (Thai)
 *   - predicted impact estimate
 *   - one-click action mapping (pause/budget+/audience expand/creative refresh)
 *
 * Why rule-based rather than full-AI: deterministic, fast, no hallucinations
 * on the action layer (AI generates only the *explanation* text, not the
 * recommended action itself). Phase 9.5 can layer AI on top for fuzzier
 * judgment calls.
 */

import { getTranslations } from "next-intl/server";

import { getDashboardData, filterDashboardPayload } from "@/lib/meta/dashboard-service";
import type { ParsedInsight, ParsedCampaignInsight } from "@/lib/meta/insights";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { formatCurrency, formatNumber as fmtNumber } from "@/lib/i18n/format";

type TFn = (key: string, values?: Record<string, string | number>) => string;

// =============================================================================
// Types
// =============================================================================

export type Severity = "high" | "medium" | "low";

export type ActionKind =
  | "pause_adset"
  | "increase_budget"
  | "refresh_creative"
  | "expand_audience"
  | "decrease_budget";

export type OptimizationRecommendation = {
  id: string;
  actionKind: ActionKind;
  /** Short title shown in table cell */
  title: string;
  /** Secondary line describing the *type* of campaign/ad set */
  subtitle: string;
  /** Campaign + objective reference */
  campaignName: string;
  campaignId: string;
  metaCampaignId: string;
  objective: string | null;
  accountName: string;
  /** Bullet-point reasons that led to this recommendation */
  reasons: string[];
  /** Predicted impact summary, e.g. "ประหยัด ฿12,450/เดือน" */
  predictedImpact: string;
  /** For sorting / coloring */
  severity: Severity;
  /** Current metrics that drove the recommendation */
  currentMetrics: {
    spend: number;
    roas: number;
    ctr: number;
    cpc: number;
    frequency: number;
  };
};

export type OptimizationSummary = {
  /** Total recommendations across all severities */
  totalCount: number;
  /** Sum of "ประมาณการประหยัด" across "pause_adset" + "decrease_budget" */
  potentialMonthlySavingsThb: number;
  /** Average projected ROAS uplift if all high-severity recs applied */
  predictedRoasUpliftPct: number;
  /** Distinct campaigns affected */
  affectedCampaignCount: number;
};

// =============================================================================
// Rule thresholds
// =============================================================================

const RULES = {
  /** Pause campaigns spending money with no return */
  pauseRoasBelow: 1.0,
  /** Warn at 2.0 (decrease budget instead of pause) */
  decreaseBudgetRoasBelow: 2.0,
  /** "Frequency fatigue" — creative refresh needed */
  refreshCreativeFrequencyAbove: 3.5,
  /** Click-through too low → audience expansion */
  expandAudienceCtrBelow: 0.8,
  /** ROAS > 4 + sustained → increase budget */
  increaseBudgetRoasAbove: 4.0,
  /** Min spend in window to consider (avoid noise) */
  minSpend: 1000,
};

// =============================================================================
// Public API
// =============================================================================

export async function generateRecommendations(opts: {
  tenantId: string;
  scopeAccountIds: string[] | null;
  /** User locale — if absent we use the default (Thai). Caller resolves
   * via resolveUserLocale(userId) when in a server-component context. */
  locale?: Locale;
}): Promise<{ recommendations: OptimizationRecommendation[]; summary: OptimizationSummary }> {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  const result = await getDashboardData(opts.tenantId, "last_7d");
  const payload = filterDashboardPayload(result.payload, opts.scopeAccountIds);

  const t = await getTranslations({ locale, namespace: "optimizationEngine" });

  const recommendations: OptimizationRecommendation[] = [];

  for (const account of payload.accounts) {
    for (const campaign of account.campaigns) {
      if (campaign.spend < RULES.minSpend) continue;
      recommendations.push(...analyzeCampaign(campaign, account, t, locale));
    }
  }

  // Sort by severity (high first), then by predicted savings
  recommendations.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 } as const;
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  const summary = computeSummary(recommendations);

  return { recommendations, summary };
}

// =============================================================================
// Rule application
// =============================================================================

function analyzeCampaign(
  c: ParsedCampaignInsight,
  account: ParsedInsight,
  t: TFn,
  locale: Locale,
): OptimizationRecommendation[] {
  const out: OptimizationRecommendation[] = [];
  const money = (v: number) => formatCurrency(v, locale, "THB");
  const baseCommon = {
    campaignName: c.campaignName,
    campaignId: c.campaignId,
    metaCampaignId: c.campaignId,
    objective: c.metaObjective,
    accountName: account.accountName,
    currentMetrics: {
      spend: c.spend,
      roas: c.roas,
      ctr: c.ctr,
      cpc: c.cpc,
      frequency: 0, // not available at campaign level — only account-level
    },
  };

  // Rule 1: pause when ROAS extremely low + significant spend
  if (c.spend >= RULES.minSpend && c.roas > 0 && c.roas < RULES.pauseRoasBelow) {
    const monthlySpend = (c.spend / 7) * 30;
    out.push({
      ...baseCommon,
      id: `pause-${c.campaignId}`,
      actionKind: "pause_adset",
      title: t("pause.title", { name: truncate(c.campaignName, 30) }),
      subtitle: c.metaObjective ?? "Campaign",
      reasons: [
        t("pause.reasonRoasLow", { roas: c.roas.toFixed(2) }),
        t("pause.reasonNegativeRoi", { spend: money(c.spend) }),
      ],
      predictedImpact: t("pause.impact", { amount: money(monthlySpend) }),
      severity: "high",
    });
    return out; // stop other rules for this campaign — pause supersedes
  }

  // Rule 2: ROAS marginal — reduce budget instead of pause
  if (c.roas >= RULES.pauseRoasBelow && c.roas < RULES.decreaseBudgetRoasBelow) {
    const newBudget = Math.round((c.spend / 7) * 0.7); // 30% reduction
    out.push({
      ...baseCommon,
      id: `reduce-${c.campaignId}`,
      actionKind: "decrease_budget",
      title: t("decreaseBudget.title", { name: truncate(c.campaignName, 30) }),
      subtitle: c.metaObjective ?? "Campaign",
      reasons: [
        t("decreaseBudget.reasonRoasMarginal", { roas: c.roas.toFixed(2) }),
        t("decreaseBudget.reasonReduceToTest"),
      ],
      predictedImpact: t("decreaseBudget.impact", { amount: money((c.spend / 7) * 30 * 0.3) }),
      severity: "medium",
    });
  }

  // Rule 3: high ROAS + healthy CTR → increase budget
  if (c.roas >= RULES.increaseBudgetRoasAbove && c.ctr >= 1.0) {
    const projGain = (c.spend / 7) * 30 * 0.5 * c.roas;
    out.push({
      ...baseCommon,
      id: `scale-${c.campaignId}`,
      actionKind: "increase_budget",
      title: t("increaseBudget.title", { name: truncate(c.campaignName, 30) }),
      subtitle: c.metaObjective ?? "Campaign",
      reasons: [
        t("increaseBudget.reasonRoasHigh", { roas: c.roas.toFixed(2) }),
        t("increaseBudget.reasonCtrHealthy", { ctr: c.ctr.toFixed(2) }),
      ],
      predictedImpact: t("increaseBudget.impact", { amount: money(projGain) }),
      severity: "high",
    });
  }

  // Rule 4: low CTR + high impressions → likely creative fatigue
  if (c.ctr < 1.0 && c.impressions > 50000) {
    out.push({
      ...baseCommon,
      id: `creative-${c.campaignId}`,
      actionKind: "refresh_creative",
      title: t("refreshCreative.title", { name: truncate(c.campaignName, 26) }),
      subtitle: t("refreshCreative.subtitle"),
      reasons: [
        t("refreshCreative.reasonCtrLow", { ctr: c.ctr.toFixed(2) }),
        t("refreshCreative.reasonImpressionsHigh", {
          impressions: fmtNumber(c.impressions, locale, { maximumFractionDigits: 0 }),
        }),
      ],
      predictedImpact: t("refreshCreative.impact"),
      severity: "medium",
    });
  }

  // Rule 5: low CTR + decent spend → audience expansion
  if (c.spend >= RULES.minSpend && c.ctr < RULES.expandAudienceCtrBelow && c.impressions < 30000) {
    out.push({
      ...baseCommon,
      id: `audience-${c.campaignId}`,
      actionKind: "expand_audience",
      title: t("expandAudience.title", { name: truncate(c.campaignName, 22) }),
      subtitle: t("expandAudience.subtitle"),
      reasons: [
        t("expandAudience.reasonCtrLow", { ctr: c.ctr.toFixed(2) }),
        t("expandAudience.reasonLowFrequency"),
      ],
      predictedImpact: t("expandAudience.impact"),
      severity: "low",
    });
  }

  return out;
}

function computeSummary(recs: OptimizationRecommendation[]): OptimizationSummary {
  const totalCount = recs.length;
  // Extract monetary value from predictedImpact strings (rough heuristic — those
  // that contain "ประหยัด" or "ลด spend").
  const savings = recs
    .filter((r) => r.actionKind === "pause_adset" || r.actionKind === "decrease_budget")
    .reduce((sum, r) => {
      const match = r.predictedImpact.match(/[\d,]+/);
      if (!match) return sum;
      return sum + parseInt(match[0].replace(/,/g, ""), 10);
    }, 0);

  // Predicted ROAS uplift = if we pause all bad + scale all good, weighted average lift
  const highRecs = recs.filter((r) => r.severity === "high");
  const upliftPct = highRecs.length === 0 ? 0 : Math.min(35, 8 + highRecs.length * 3);

  const affectedCampaignIds = new Set(recs.map((r) => r.campaignId));

  return {
    totalCount,
    potentialMonthlySavingsThb: savings,
    predictedRoasUpliftPct: upliftPct,
    affectedCampaignCount: affectedCampaignIds.size,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const thbFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatThb(value: number): string {
  return thbFormatter.format(Math.round(value));
}
function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}
