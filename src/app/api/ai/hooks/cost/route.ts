/**
 * GET /api/ai/hooks/cost — cost meter for the Hook Lab sidebar chip.
 *
 * Returns:
 *   - today USD spend (sum of HookConcept.costUsd + HookAnalysis.costUsd)
 *   - 7-day rolling USD spend
 *   - per-endpoint daily rate-limit usage (peek — does NOT consume a slot)
 */

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { resolveTenant } from "@/lib/hooks/route-helpers";
import {
  HOOK_DAILY_CAPS,
  peekHookRateLimit,
  type HookRateLimitEndpoint,
} from "@/lib/hooks/rate-limit";

/** Bangkok-local midnight UTC boundary for "today". */
function bangkokDayStart(daysAgo: number): Date {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  bkk.setUTCHours(0, 0, 0, 0);
  bkk.setUTCDate(bkk.getUTCDate() - daysAgo);
  return new Date(bkk.getTime() - 7 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  const auth = await resolveTenant(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const todayStart = bangkokDayStart(0);
  const weekStart = bangkokDayStart(7);

  const [todayConcepts, todayAnalyses, weekConcepts, weekAnalyses] = await Promise.all([
    prisma.hookConcept.aggregate({
      _sum: { costUsd: true },
      _count: { _all: true },
      where: { tenantId: ctx.tenant.id, createdAt: { gte: todayStart } },
    }),
    prisma.hookAnalysis.aggregate({
      _sum: { costUsd: true },
      _count: { _all: true },
      where: { tenantId: ctx.tenant.id, createdAt: { gte: todayStart } },
    }),
    prisma.hookConcept.aggregate({
      _sum: { costUsd: true },
      _count: { _all: true },
      where: { tenantId: ctx.tenant.id, createdAt: { gte: weekStart } },
    }),
    prisma.hookAnalysis.aggregate({
      _sum: { costUsd: true },
      _count: { _all: true },
      where: { tenantId: ctx.tenant.id, createdAt: { gte: weekStart } },
    }),
  ]);

  const todayUsd =
    (todayConcepts._sum.costUsd ?? 0) + (todayAnalyses._sum.costUsd ?? 0);
  const weekUsd = (weekConcepts._sum.costUsd ?? 0) + (weekAnalyses._sum.costUsd ?? 0);

  const endpoints: HookRateLimitEndpoint[] = [
    "generate",
    "iterate",
    "analyze",
    "visual",
    "heuristic",
  ];
  const rateLimits = endpoints.map((endpoint) => ({
    endpoint,
    cap: HOOK_DAILY_CAPS[endpoint],
    ...peekHookRateLimit(ctx.tenant.id, endpoint),
  }));

  return NextResponse.json({
    ok: true,
    tenantId: ctx.tenant.id,
    today: {
      costUsd: Number(todayUsd.toFixed(6)),
      concepts: todayConcepts._count._all,
      analyses: todayAnalyses._count._all,
      windowStart: todayStart.toISOString(),
    },
    last7Days: {
      costUsd: Number(weekUsd.toFixed(6)),
      concepts: weekConcepts._count._all,
      analyses: weekAnalyses._count._all,
      windowStart: weekStart.toISOString(),
    },
    rateLimits,
  });
}
