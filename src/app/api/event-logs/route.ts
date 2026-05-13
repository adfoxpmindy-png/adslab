import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/event-logs?tenantSlug=<slug>&limit=&eventName=&status=
 *
 * Recent EventLog rows for debugging SDK fires. Read-only, returns
 * latest 100 by default. Used by the Event Log page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const eventName = url.searchParams.get("eventName");
  const status = url.searchParams.get("status"); // pending | success | failed

  const { tenant } = await requireTenantMember(tenantSlug);

  const logs = await prisma.eventLog.findMany({
    where: {
      tenantId: tenant.id,
      ...(eventName ? { eventName } : {}),
      ...(status ? { capiStatus: status } : {}),
    },
    orderBy: { firedAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ logs });
}
