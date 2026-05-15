import { NextResponse } from "next/server";

import { generateDailyReportsForAllTenants } from "@/lib/reports/daily-report";
import { prisma } from "@/lib/prisma";
import { runTickForTenant } from "@/lib/rules/runner";

// Vercel will also call this with `Authorization: Bearer <CRON_SECRET>`
// when scheduled via vercel.json. Manual invocation requires the same.

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateOverride = url.searchParams.get("date") ?? undefined;
  if (dateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const results = await generateDailyReportsForAllTenants(dateOverride);
  const counts = {
    completed: results.filter((r) => r.result.status === "completed").length,
    skipped: results.filter((r) => r.result.status === "skipped").length,
    failed: results.filter((r) => r.result.status === "failed").length,
  };

  // Piggyback: same physical cron also runs the auto-rules engine.
  // Vercel Hobby allows only 2 daily cron slots; rather than burn a
  // slot for rules we co-locate here. Future Pro upgrade unlocks the
  // standalone /api/cron/rules-tick at hourly cadence.
  const ruleTenants = await prisma.tenant.findMany({
    where: { autoRules: { some: { enabled: true } } },
    select: { id: true },
  });
  const ruleResults: Array<{ tenantId: string; ok: boolean; error?: string; evaluated?: number; fired?: number }> = [];
  for (const t of ruleTenants) {
    try {
      const stats = await runTickForTenant(t.id);
      ruleResults.push({ tenantId: t.id, ok: true, evaluated: stats.evaluated, fired: stats.fired });
    } catch (err) {
      ruleResults.push({ tenantId: t.id, ok: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    counts,
    results,
    rules: { tenantsProcessed: ruleTenants.length, results: ruleResults },
  });
}

// Vercel cron sends GET requests; mirror the POST handler for convenience.
export const GET = POST;
