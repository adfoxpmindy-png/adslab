import { prisma } from "@/lib/prisma";
import { getConnection, getFreshAccessToken } from "./client";
import { convertToThb } from "./fx";
import {
  fetchInsightsForAllAccounts,
  type DashboardPayload,
  type DashboardSummary,
  type DateRangeKey,
  type ParsedInsight,
} from "./insights";

const SCOPE_SUMMARY = "summary";

function getCacheTtlSec(): number {
  const v = Number(process.env.INSIGHTS_CACHE_TTL_SEC);
  return Number.isFinite(v) && v > 0 ? v : 900; // 15 min default
}

function aggregate(accounts: ParsedInsight[]): DashboardSummary {
  let spendThb = 0;
  let purchaseValueThb = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;

  for (const a of accounts) {
    spendThb += convertToThb(a.spend, a.currency);
    purchaseValueThb += convertToThb(a.purchaseValue, a.currency);
    impressions += a.impressions;
    clicks += a.clicks;
    conversions += a.conversions;
  }

  return {
    spendThb,
    impressions,
    clicks,
    conversions,
    purchaseValueThb,
    roas: spendThb > 0 ? purchaseValueThb / spendThb : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spendThb / impressions) * 1000 : 0,
  };
}

type DashboardResult = {
  payload: DashboardPayload;
  /** True if the result came from cache (regardless of freshness). */
  fromCache: boolean;
  /** True if the cached entry has passed its expiresAt. */
  isStale: boolean;
};

export async function getDashboardData(
  tenantId: string,
  range: DateRangeKey,
): Promise<DashboardResult> {
  // 1. Try cache
  const cached = await prisma.metaInsightCache.findUnique({
    where: { tenantId_scope_rangeKey: { tenantId, scope: SCOPE_SUMMARY, rangeKey: range } },
  });
  if (cached) {
    const isStale = cached.expiresAt.getTime() < Date.now();
    return {
      payload: cached.payload as DashboardPayload,
      fromCache: true,
      isStale,
    };
  }

  // 2. Cache miss → fetch from Meta
  return fetchAndCache(tenantId, range);
}

/** Force-refresh cache for the given range. */
export async function refreshDashboardData(
  tenantId: string,
  range: DateRangeKey,
): Promise<DashboardResult> {
  return fetchAndCache(tenantId, range);
}

async function fetchAndCache(tenantId: string, range: DateRangeKey): Promise<DashboardResult> {
  const connection = await getConnection(tenantId);
  if (!connection) throw new Error("Tenant has no Meta connection");
  if (connection.status !== "ACTIVE") throw new Error(`Connection status is ${connection.status}`);

  const accessToken = await getFreshAccessToken(connection);
  const accounts = await fetchInsightsForAllAccounts(accessToken, range);

  const payload: DashboardPayload = {
    range,
    summary: aggregate(accounts),
    accounts,
    fetchedAt: new Date().toISOString(),
  };

  const ttlSec = getCacheTtlSec();
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  await prisma.metaInsightCache.upsert({
    where: { tenantId_scope_rangeKey: { tenantId, scope: SCOPE_SUMMARY, rangeKey: range } },
    update: { payload: payload as unknown as object, fetchedAt: new Date(), expiresAt },
    create: {
      tenantId,
      scope: SCOPE_SUMMARY,
      rangeKey: range,
      payload: payload as unknown as object,
      expiresAt,
    },
  });

  return { payload, fromCache: false, isStale: false };
}

export async function invalidateDashboardCache(tenantId: string): Promise<void> {
  await prisma.metaInsightCache.deleteMany({ where: { tenantId } });
}

// -----------------------------------------------------------------------------
// KPI grading (red / yellow / green)
// -----------------------------------------------------------------------------

export type Tone = "good" | "warn" | "bad";

export function gradeCpm(cpmThb: number): Tone {
  if (cpmThb < 50) return "good";
  if (cpmThb < 100) return "warn";
  return "bad";
}

export function gradeRoas(roas: number): Tone {
  if (roas >= 3) return "good";
  if (roas >= 2) return "warn";
  return "bad";
}

export function gradeCtr(ctrPercent: number): Tone {
  if (ctrPercent >= 1.5) return "good";
  if (ctrPercent >= 0.8) return "warn";
  return "bad";
}
