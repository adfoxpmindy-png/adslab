/**
 * Annotate a Daily Report's stored suggestions with outcome badges
 * (sourced from AIRecommendationOutcome) and forward-looking confidence
 * scores (sourced from recommendation-stats).
 *
 * Used by /reports/[reportId] to make AI's learning loop visible to user.
 */
import { prisma } from "@/lib/prisma";
import type { ValidatedSuggestion } from "@/lib/reports/extract-actions";
import { computeConfidence, type ConfidenceResult } from "@/lib/ai/recommendation-stats";

const FRESH_REPORT_WINDOW_HOURS = 36;

export type OutcomeBadgeKind =
  | "followed-positive"
  | "followed-negative"
  | "followed-neutral"
  | "ignored"
  | "target_deleted"
  | "no_data"
  | "pending";

export type OutcomeBadge = {
  kind: OutcomeBadgeKind;
  metricLabel?: string;
  percentChange?: number;
};

export type EnrichedSuggestion = ValidatedSuggestion & {
  outcomeBadge?: OutcomeBadge | null;
  confidenceBadge?: ConfidenceResult | null;
};

const ACTION_TO_TYPE: Record<string, string> = {
  PAUSE: "pause",
  RESUME: "resume",
  SET_BUDGET: "change_budget",
  DUPLICATE: "scale_budget",
  SET_END_DATE: "other",
};

function outcomeKind(
  actionTaken: string,
  kpiDelta: { metric: string; percentChange: number } | null,
  actionType: string,
): OutcomeBadge {
  if (actionTaken === "target_deleted") return { kind: "target_deleted" };
  if (actionTaken === "no_data") return { kind: "no_data" };
  if (actionTaken === "ignored") return { kind: "ignored" };

  // followed — judge by KPI direction. Lower-is-better for spend/cpv/cpm.
  if (!kpiDelta) return { kind: "followed-neutral" };
  const lowerIsBetter = ["spend", "cpv", "cpm"].includes(kpiDelta.metric);
  const change = kpiDelta.percentChange;
  // Treat near-zero as neutral to avoid flapping on tiny movements.
  if (Math.abs(change) < 1) {
    return {
      kind: "followed-neutral",
      metricLabel: kpiDelta.metric,
      percentChange: change,
    };
  }
  const positive = lowerIsBetter ? change < 0 : change > 0;
  // For pause/resume, "positive" depends on what the user is trying to do.
  // A pause action — we don't really care about ROAS movement of a paused
  // campaign. Keep generic interpretation.
  void actionType;
  return {
    kind: positive ? "followed-positive" : "followed-negative",
    metricLabel: kpiDelta.metric,
    percentChange: change,
  };
}

export async function enrichReportSuggestions(args: {
  tenantId: string;
  reportDate: Date;
  suggestions: ValidatedSuggestion[];
  /** When true, also compute confidence badges (only for fresh reports). */
  includeConfidence: boolean;
}): Promise<EnrichedSuggestion[]> {
  const { tenantId, reportDate, suggestions, includeConfidence } = args;
  if (suggestions.length === 0) return [];

  // Window: same UTC day as the report (covers any time-of-day generation).
  const dayStart = new Date(reportDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const targetMetaIds = Array.from(
    new Set(suggestions.map((s) => s.metaCampaignId).filter(Boolean)),
  );

  const recs = targetMetaIds.length
    ? await prisma.aIRecommendation.findMany({
        where: {
          tenantId,
          targetMetaId: { in: targetMetaIds },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        include: { outcome: true },
      })
    : [];

  // Build a map: (targetMetaId, actionType) -> rec+outcome
  const recIndex = new Map<
    string,
    {
      actionType: string;
      outcome: {
        actionTaken: string;
        kpiDelta: { metric: string; percentChange: number } | null;
      } | null;
    }
  >();
  for (const r of recs) {
    const key = `${r.targetMetaId}|${r.actionType}`;
    if (recIndex.has(key)) continue; // first match wins
    recIndex.set(key, {
      actionType: r.actionType,
      outcome: r.outcome
        ? {
            actionTaken: r.outcome.actionTaken,
            kpiDelta: r.outcome.kpiDelta as { metric: string; percentChange: number } | null,
          }
        : null,
    });
  }

  // For fresh reports we compute confidence per distinct actionType so we
  // don't repeat the same DB aggregation for every suggestion.
  const confidenceByActionType = new Map<string, ConfidenceResult | null>();
  if (includeConfidence) {
    const distinctTypes = Array.from(
      new Set(suggestions.map((s) => ACTION_TO_TYPE[s.action] ?? "other")),
    );
    await Promise.all(
      distinctTypes.map(async (t) => {
        const c = await computeConfidence(tenantId, t).catch(() => null);
        confidenceByActionType.set(t, c);
      }),
    );
  }

  return suggestions.map((s) => {
    const actionType = ACTION_TO_TYPE[s.action] ?? "other";
    const recHit = recIndex.get(`${s.metaCampaignId}|${actionType}`);

    let outcomeBadge: OutcomeBadge | null = null;
    if (recHit) {
      outcomeBadge = recHit.outcome
        ? outcomeKind(recHit.outcome.actionTaken, recHit.outcome.kpiDelta, actionType)
        : { kind: "pending" };
    }

    const confidenceBadge = includeConfidence
      ? (confidenceByActionType.get(actionType) ?? null)
      : null;

    return {
      ...s,
      outcomeBadge,
      confidenceBadge,
    };
  });
}

export function isFreshReport(generatedAt: Date | null): boolean {
  if (!generatedAt) return false;
  return Date.now() - generatedAt.getTime() < FRESH_REPORT_WINDOW_HOURS * 60 * 60_000;
}
