/**
 * Hourly cron: enumerate every tenant with active auto-rules and run
 * the engine. Per-tenant errors are caught so one bad tenant doesn't
 * stop the rest.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` like every
 * other cron endpoint. Vercel attaches this header automatically for
 * scheduled invocations.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { runTickForTenant } from "@/lib/rules/runner";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tenants with at least one enabled rule.
  const tenants = await prisma.tenant.findMany({
    where: { autoRules: { some: { enabled: true } } },
    select: { id: true, slug: true },
  });

  const results: Array<{ tenant: string; ok: boolean; evaluated?: number; fired?: number; error?: string }> = [];
  for (const t of tenants) {
    try {
      const stats = await runTickForTenant(t.id);
      results.push({ tenant: t.slug, ok: true, evaluated: stats.evaluated, fired: stats.fired });
    } catch (err) {
      results.push({ tenant: t.slug, ok: false, error: (err as Error).message });
    }
  }
  return NextResponse.json({
    ok: true,
    tenantsProcessed: tenants.length,
    results,
  });
}

export const GET = POST;
export const runtime = "nodejs";
export const maxDuration = 300;
