import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { syncAdAccounts } from "@/lib/meta/client";

/**
 * POST /api/meta/sync?tenantSlug=<slug>
 *
 * Re-fetches the user's ad accounts from Meta and replaces the cached
 * MetaAdAccount rows. OWNER-only because it may trigger a token refresh
 * and consumes API quota.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER"]);

  try {
    const result = await syncAdAccounts(tenant.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[meta/sync] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
