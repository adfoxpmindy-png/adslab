import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { disconnectMeta } from "@/lib/meta/client";

/**
 * POST /api/meta/disconnect?tenantSlug=<slug>
 *
 * Removes the tenant's Meta connection (and all cached ad accounts via FK
 * cascade). OWNER-only — the access token is sensitive and represents the
 * agency's relationship with Meta.
 *
 * Note: this does NOT revoke the OAuth grant on Facebook's side. The user
 * remains "logged in" at Facebook level. If they want full revocation,
 * they must remove the app from Facebook Settings → Apps and Websites,
 * which triggers our deauthorize callback.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER"]);

  await disconnectMeta(tenant.id);
  return NextResponse.json({ ok: true });
}
