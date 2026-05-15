/**
 * Aggregate helpers over AIRecommendation + AIRecommendationOutcome.
 *
 * Used by two UI surfaces:
 *   - Daily Report renderer (confidence badge per fresh rec)
 *   - /ai/memory page (rolling success rate + breakdowns)
 *
 * Keep this module pure — no Meta API, no LLM, just SQL aggregation +
 * deterministic success-definition logic.
 */
import { prisma } from "@/lib/prisma";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_WEEKS = 4;
const MIN_SAMPLE_FOR_CONFIDENCE = 3;

/**
 * Direction a KPI must move for an action to count as successful.
 *   -1 = lower-is-better (spend, cpv, cpm)
 *   +1 = higher-is-better (roas, ctr)
 * Spend interacts weirdly with pause/resume — we treat "spend dropped
 * after a pause" as success only if the pause was followed.
 */
type Metric = "spend" | "cpv" | "cpm" | "roas" | "ctr";

const METRIC_DIRECTION: Record<Metric, -1 | 1> = {
  spend: -1,
  cpv: -1,
  cpm: -1,
  roas: 1,
  ctr: 1,
};

const SUCCESS_THRESHOLD_PERCENT: Record<Metric, number> = {
  // For lower-is-better, any drop counts. For higher-is-better, demand >5%.
  spend: 0,
  cpv: 0,
  cpm: 0,
  roas: 5,
  ctr: 5,
};

type KpiDelta = {
  metric: string;
  before: number;
  after: number;
  percentChange: number;
};

type OutcomeForCheck = {
  actionTaken: string;
  kpiDelta: KpiDelta | null;
};

type RecForCheck = {
  actionType: string;
};

/**
 * Pure function — given a rec and its outcome, is this a success?
 *
 * Rules:
 *   - Only "followed" outcomes are eligible. Ignored / target_deleted /
 *     no_data are excluded from success-rate calculations.
 *   - Action with no kpiDelta (e.g., diagnose, refresh_creative without
 *     captured movement) defaults to "followed = success" since the user
 *     acted on the advice. KPI gating only kicks in when we have a delta.
 *   - With a kpiDelta, the metric must move in the favorable direction
 *     by at least its threshold percent.
 */
export function successDefinition(
  rec: RecForCheck,
  outcome: OutcomeForCheck,
): boolean {
  if (outcome.actionTaken !== "followed") return false;
  const k = outcome.kpiDelta;
  if (!k) return true;
  const metric = k.metric as Metric;
  const direction = METRIC_DIRECTION[metric];
  if (!direction) return true;
  const threshold = SUCCESS_THRESHOLD_PERCENT[metric] ?? 0;
  const change = k.percentChange;
  return direction === 1 ? change >= threshold : change <= -threshold;
}

export type ConfidenceResult = {
  total: number;
  successful: number;
  percent: number;
};

/**
 * Rolling confidence for "if I emit a rec of THIS actionType, what's
 * the historical success rate?" Returns null when sample size is too
 * small to be meaningful (< 3). Callers should hide the badge in that
 * case rather than render a misleading "1/1 · 100%".
 */
export async function computeConfidence(
  tenantId: string,
  actionType: string,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Promise<ConfidenceResult | null> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60_000);
  const rows = await prisma.aIRecommendation.findMany({
    where: {
      tenantId,
      actionType,
      createdAt: { gte: since },
      outcome: { isNot: null },
    },
    include: { outcome: true },
  });
  if (rows.length < MIN_SAMPLE_FOR_CONFIDENCE) return null;
  let successful = 0;
  for (const r of rows) {
    if (!r.outcome) continue;
    const ok = successDefinition(
      { actionType: r.actionType },
      {
        actionTaken: r.outcome.actionTaken,
        kpiDelta: r.outcome.kpiDelta as KpiDelta | null,
      },
    );
    if (ok) successful++;
  }
  const total = rows.length;
  return {
    total,
    successful,
    percent: total === 0 ? 0 : Math.round((successful / total) * 100),
  };
}

export type WeeklyRollup = {
  weekStart: Date;
  total: number;
  successful: number;
};

/**
 * Week boundary = Monday 00:00 UTC. Returns oldest week first.
 */
function mondayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const dow = x.getUTCDay(); // 0 = Sun, 1 = Mon
  const diff = (dow + 6) % 7; // days since Monday
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}

export async function weeklyRollingSuccessRate(
  tenantId: string,
  weeks: number = DEFAULT_WEEKS,
): Promise<WeeklyRollup[]> {
  const now = new Date();
  const firstMonday = mondayUTC(now);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - (weeks - 1) * 7);
  const rows = await prisma.aIRecommendation.findMany({
    where: {
      tenantId,
      createdAt: { gte: firstMonday },
      outcome: { isNot: null },
    },
    include: { outcome: true },
  });

  const buckets = new Map<string, WeeklyRollup>();
  for (let i = 0; i < weeks; i++) {
    const wk = new Date(firstMonday);
    wk.setUTCDate(wk.getUTCDate() + i * 7);
    buckets.set(wk.toISOString(), { weekStart: wk, total: 0, successful: 0 });
  }
  for (const r of rows) {
    const wk = mondayUTC(r.createdAt).toISOString();
    const b = buckets.get(wk);
    if (!b) continue;
    b.total++;
    if (
      r.outcome &&
      successDefinition(
        { actionType: r.actionType },
        {
          actionTaken: r.outcome.actionTaken,
          kpiDelta: r.outcome.kpiDelta as KpiDelta | null,
        },
      )
    ) {
      b.successful++;
    }
  }
  return Array.from(buckets.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
  );
}

export type ActionTypeRollup = {
  actionType: string;
  total: number;
  successful: number;
  percent: number;
};

export async function actionTypeBreakdown(
  tenantId: string,
): Promise<ActionTypeRollup[]> {
  const rows = await prisma.aIRecommendation.findMany({
    where: { tenantId, outcome: { isNot: null } },
    include: { outcome: true },
  });
  const m = new Map<string, { total: number; successful: number }>();
  for (const r of rows) {
    const cur = m.get(r.actionType) ?? { total: 0, successful: 0 };
    cur.total++;
    if (
      r.outcome &&
      successDefinition(
        { actionType: r.actionType },
        {
          actionTaken: r.outcome.actionTaken,
          kpiDelta: r.outcome.kpiDelta as KpiDelta | null,
        },
      )
    ) {
      cur.successful++;
    }
    m.set(r.actionType, cur);
  }
  return Array.from(m.entries())
    .map(([actionType, v]) => ({
      actionType,
      total: v.total,
      successful: v.successful,
      percent: v.total === 0 ? 0 : Math.round((v.successful / v.total) * 100),
    }))
    .sort((a, b) => b.total - a.total);
}

export type RecentOutcomeRow = {
  recId: string;
  date: Date;
  actionType: string;
  targetKind: string;
  targetMetaId: string;
  actionTaken: string;
  kpiDelta: KpiDelta | null;
  isSuccess: boolean;
};

export async function recentOutcomes(
  tenantId: string,
  limit = 20,
): Promise<RecentOutcomeRow[]> {
  const rows = await prisma.aIRecommendation.findMany({
    where: { tenantId, outcome: { isNot: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { outcome: true },
  });
  return rows.flatMap((r) => {
    if (!r.outcome) return [];
    const kpiDelta = r.outcome.kpiDelta as KpiDelta | null;
    return [
      {
        recId: r.id,
        date: r.outcome.computedAt,
        actionType: r.actionType,
        targetKind: r.targetKind,
        targetMetaId: r.targetMetaId,
        actionTaken: r.outcome.actionTaken,
        kpiDelta,
        isSuccess: successDefinition(
          { actionType: r.actionType },
          { actionTaken: r.outcome.actionTaken, kpiDelta },
        ),
      },
    ];
  });
}

/**
 * Count of recs currently in the 7-day waiting window (no outcome yet).
 * Used by the Memory page empty state.
 */
export async function countPendingOutcomes(tenantId: string): Promise<number> {
  return prisma.aIRecommendation.count({
    where: { tenantId, outcome: null },
  });
}
