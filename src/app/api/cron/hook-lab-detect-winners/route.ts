import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { detectTopWinners } from "@/lib/hooks/meta-detect-winners";

/**
 * GET/POST /api/cron/hook-lab-detect-winners
 *
 * Nightly refresh of the HookWinner cache. Iterates every tenant that
 *   - has an ACTIVE MetaConnection, AND
 *   - either has no HookWinner rows yet, OR whose freshest cached row
 *     has already expired (cachedUntil < now).
 *
 * Each tenant runs sequentially with a 60s wall-time cap enforced
 * inside detectTopWinners itself. Failures per tenant are logged and
 * don't block the rest.
 *
 * Scheduled via vercel.json ("0 3 * * *" UTC = 10:00 Bangkok).
 */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Candidate tenants: ACTIVE Meta connection + (no rows OR freshest row
  // is stale). Doing this in JS after a single scan keeps the query cheap
  // on Neon; hookWinner rows are small (one row per Meta ad, 3-ish per
  // tenant), so scanning them per-tenant is fine.
  const candidates = await prisma.tenant.findMany({
    where: {
      metaConnection: { status: "ACTIVE" },
    },
    select: {
      id: true,
      slug: true,
      hookWinners: {
        select: { cachedUntil: true },
        orderBy: { cachedUntil: "desc" },
        take: 1,
      },
    },
  });

  const dueTenants = candidates.filter((t) => {
    const freshest = t.hookWinners[0]?.cachedUntil;
    return !freshest || freshest < now;
  });

  const results: Array<{
    tenantId: string;
    tenantSlug: string;
    ok: boolean;
    winnersCached?: number;
    warnings?: string[];
    error?: string;
    durationMs?: number;
  }> = [];

  for (const t of dueTenants) {
    const started = Date.now();
    try {
      const r = await detectTopWinners(t.id);
      results.push({
        tenantId: t.id,
        tenantSlug: t.slug,
        ok: true,
        winnersCached: r.winners.length,
        warnings: r.warnings,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      results.push({
        tenantId: t.id,
        tenantSlug: t.slug,
        ok: false,
        error: (err as Error).message,
        durationMs: Date.now() - started,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    due: dueTenants.length,
    results,
  });
}

// Vercel cron sends GET requests; mirror the POST handler for convenience
// (matches the pattern in /api/cron/daily-report).
export const GET = POST;
