import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { refreshDashboardData } from "@/lib/meta/dashboard-service";
import type { DateRangeKey } from "@/lib/meta/insights";

const PRESETS: DateRangeKey[] = ["today", "yesterday", "last_7d", "last_30d"];

function parseRangeKey(raw: string | null): DateRangeKey | null {
  if (!raw) return "last_7d";
  if ((PRESETS as string[]).includes(raw)) return raw as DateRangeKey;
  if (/^custom:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw as DateRangeKey;
  }
  return null;
}

/** POST /api/meta/insights/refresh?tenantSlug=<slug>&range=<preset|custom:..> */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const range = parseRangeKey(url.searchParams.get("range"));
  if (!range) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  // VIEWER may not trigger a fresh Meta API call (consumes quota).
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  try {
    const result = await refreshDashboardData(tenant.id, range);
    return NextResponse.json({ ok: true, ...result.payload, fromCache: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    console.error("[meta/insights/refresh] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
