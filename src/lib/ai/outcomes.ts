/**
 * Compute outcomes for AI recommendations that are at least 7 days old
 * and don't yet have a paired AIRecommendationOutcome row.
 *
 * For each rec we determine:
 *   1. actionTaken — did the user follow the advice?
 *   2. kpiDelta    — for actions where a KPI movement is meaningful
 *                    (scale_budget, change_budget), the before/after
 *                    delta over 7-day windows around the rec.
 *
 * Called from the existing daily-report cron (piggyback).
 */
import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

const HOLD_DAYS = 7;
const HOLD_MS = HOLD_DAYS * 24 * 60 * 60_000;

type ActionTaken = "followed" | "ignored" | "opposite" | "target_deleted" | "no_data";

type KpiDelta = {
  metric: "cpv" | "roas" | "spend" | "ctr" | "cpm";
  before: number;
  after: number;
  percentChange: number;
};

export async function computeOutcomesForTenant(tenantId: string): Promise<{
  computed: number;
  skipped: number;
  failed: number;
}> {
  const conn = await getConnection(tenantId);
  if (!conn || conn.status !== "ACTIVE") {
    return { computed: 0, skipped: 0, failed: 0 };
  }
  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken(conn);
  } catch {
    return { computed: 0, skipped: 0, failed: 0 };
  }

  const cutoff = new Date(Date.now() - HOLD_MS);
  const dueRecs = await prisma.aIRecommendation.findMany({
    where: {
      tenantId,
      createdAt: { lte: cutoff },
      outcome: null,
    },
    take: 100, // bound per-tick work
  });

  let computed = 0;
  let skipped = 0;
  let failed = 0;

  for (const rec of dueRecs) {
    try {
      const result = await computeOutcomeForOne(
        rec.targetMetaId,
        rec.targetKind,
        rec.actionType,
        rec.createdAt,
        accessToken,
      );
      if (result === null) {
        skipped++;
        continue;
      }
      await prisma.aIRecommendationOutcome.create({
        data: {
          recommendationId: rec.id,
          actionTaken: result.actionTaken,
          kpiDelta: (result.kpiDelta ?? null) as never,
          errorMessage: null,
        },
      });
      computed++;
    } catch (err) {
      failed++;
      // Record an error outcome so we don't infinite-retry the same rec
      try {
        await prisma.aIRecommendationOutcome.create({
          data: {
            recommendationId: rec.id,
            actionTaken: "no_data",
            errorMessage: (err as Error).message,
          },
        });
      } catch {
        // swallow
      }
    }
  }
  return { computed, skipped, failed };
}

async function computeOutcomeForOne(
  targetMetaId: string,
  targetKind: string,
  actionType: string,
  recCreatedAt: Date,
  accessToken: string,
): Promise<{ actionTaken: ActionTaken; kpiDelta?: KpiDelta | null } | null> {
  // 1. Fetch current target status from Meta to detect followed/ignored
  let currentStatus: string | null = null;
  let exists = true;
  try {
    const meta = await graphFetch<{ status?: string; effective_status?: string }>(
      `/${targetMetaId}`,
      { accessToken, searchParams: { fields: "status,effective_status" } },
    );
    currentStatus = meta.effective_status ?? meta.status ?? null;
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/does not exist|nonexisting/i.test(msg)) {
      exists = false;
    } else {
      throw err;
    }
  }
  if (!exists) {
    return { actionTaken: "target_deleted", kpiDelta: null };
  }

  // 2. Determine actionTaken by comparing intended action vs current state
  let actionTaken: ActionTaken;
  if (actionType === "pause") {
    actionTaken = currentStatus === "PAUSED" ? "followed" : "ignored";
  } else if (actionType === "resume") {
    actionTaken = currentStatus === "ACTIVE" ? "followed" : "ignored";
  } else if (actionType === "scale_budget" || actionType === "change_budget") {
    // For budget actions we treat ANY change as "followed". A perfect
    // detection would compare against the pre-rec budget snapshot —
    // future enhancement. For now budget→KPI signal is the value.
    actionTaken = "followed";
  } else {
    // diagnose / refresh_creative / change_targeting / other — no
    // structural state change to detect. Treat as informational only.
    actionTaken = "followed";
  }

  // 3. KPI delta: only meaningful when the campaign/adset is still
  //    alive AND we have insight data for both windows. We pull Meta
  //    insights for [rec - 7d, rec) and [rec, rec + 7d).
  const kpiDelta = await fetchKpiDelta(targetMetaId, recCreatedAt, accessToken).catch(() => null);

  return { actionTaken, kpiDelta };
}

async function fetchKpiDelta(
  entityId: string,
  pivot: Date,
  accessToken: string,
): Promise<KpiDelta | null> {
  const beforeSince = new Date(pivot.getTime() - HOLD_MS);
  const beforeUntil = new Date(pivot.getTime());
  const afterSince = new Date(pivot.getTime());
  const afterUntil = new Date(pivot.getTime() + HOLD_MS);

  const [before, after] = await Promise.all([
    fetchInsightWindow(entityId, beforeSince, beforeUntil, accessToken),
    fetchInsightWindow(entityId, afterSince, afterUntil, accessToken),
  ]);

  // Pick a primary metric to report — preference order:
  //   roas (purchases) → cpv (video) → ctr → cpm → spend
  const candidates: Array<{ metric: KpiDelta["metric"]; before: number; after: number }> = [];
  if (before.roas !== null && after.roas !== null) {
    candidates.push({ metric: "roas", before: before.roas, after: after.roas });
  }
  if (before.cpv !== null && after.cpv !== null) {
    candidates.push({ metric: "cpv", before: before.cpv, after: after.cpv });
  }
  if (before.ctr !== null && after.ctr !== null) {
    candidates.push({ metric: "ctr", before: before.ctr, after: after.ctr });
  }
  if (before.cpm !== null && after.cpm !== null) {
    candidates.push({ metric: "cpm", before: before.cpm, after: after.cpm });
  }
  if (before.spend > 0 || after.spend > 0) {
    candidates.push({ metric: "spend", before: before.spend, after: after.spend });
  }
  if (candidates.length === 0) return null;

  const pick = candidates[0];
  const percentChange =
    pick.before === 0 ? 0 : ((pick.after - pick.before) / pick.before) * 100;
  return {
    metric: pick.metric,
    before: Number(pick.before.toFixed(2)),
    after: Number(pick.after.toFixed(2)),
    percentChange: Number(percentChange.toFixed(1)),
  };
}

type InsightWindow = {
  spend: number;
  impressions: number;
  clicks: number;
  videoViews: number;
  purchaseValue: number;
  roas: number | null;
  cpv: number | null;
  ctr: number | null;
  cpm: number | null;
};

async function fetchInsightWindow(
  entityId: string,
  since: Date,
  until: Date,
  accessToken: string,
): Promise<InsightWindow> {
  type Row = {
    spend?: string;
    impressions?: string;
    inline_link_clicks?: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
  };
  const r = await graphFetch<{ data?: Row[] }>(`/${entityId}/insights`, {
    accessToken,
    searchParams: {
      fields: "spend,impressions,inline_link_clicks,actions,action_values",
      time_range: JSON.stringify({
        since: since.toISOString().slice(0, 10),
        until: until.toISOString().slice(0, 10),
      }),
      time_increment: "all_days",
    },
  });
  const row = r.data?.[0] ?? {};
  const spend = parseFloat(row.spend ?? "0");
  const impressions = parseFloat(row.impressions ?? "0");
  const clicks = parseFloat(row.inline_link_clicks ?? "0");
  const sumAction = (arr: Row["actions"], types: string[]): number =>
    (arr ?? [])
      .filter((a) => types.includes(a.action_type))
      .reduce((s, a) => s + parseFloat(a.value), 0);
  const videoViews = sumAction(row.actions, ["video_view", "thruplay"]);
  const purchaseValue = sumAction(row.action_values, ["purchase", "omni_purchase"]);
  return {
    spend,
    impressions,
    clicks,
    videoViews,
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : null,
    cpv: videoViews > 0 ? spend / videoViews : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}
