import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { getDashboardData } from "@/lib/meta/dashboard-service";
import type { DateRangeKey } from "@/lib/meta/insights";

const PRESETS: DateRangeKey[] = ["today", "yesterday", "last_7d", "last_30d"];

function parseRangeKey(raw: string | null): DateRangeKey | null {
  if (!raw) return "last_7d";
  if ((PRESETS as string[]).includes(raw)) return raw as DateRangeKey;
  // custom:YYYY-MM-DD..YYYY-MM-DD
  if (/^custom:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw as DateRangeKey;
  }
  return null;
}

/** GET /api/meta/insights?tenantSlug=<slug>&range=<preset|custom:..> */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const range = parseRangeKey(url.searchParams.get("range"));
  if (!range) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  const { tenant } = await requireTenantMember(tenantSlug);

  try {
    const result = await getDashboardData(tenant.id, range);
    return NextResponse.json({
      ok: true,
      ...result.payload,
      fromCache: result.fromCache,
      isStale: result.isStale,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Insights fetch failed";
    if (message.includes("no Meta connection") || message.includes("Connection status is")) {
      return NextResponse.json({ error: message, code: "no_connection" }, { status: 409 });
    }
    console.error("[meta/insights] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
