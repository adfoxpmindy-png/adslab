import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { listAudiences } from "@/lib/meta/audiences";

/**
 * GET /api/meta/audiences?tenantSlug=<slug>&metaAccountId=act_xxx
 *
 * Returns custom / lookalike / pixel-based audiences in the specified
 * Meta ad account. 1-hour cache.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const metaAccountId = url.searchParams.get("metaAccountId");
  if (!tenantSlug || !metaAccountId) {
    return NextResponse.json(
      { error: "tenantSlug + metaAccountId required" },
      { status: 400 },
    );
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  try {
    const audiences = await listAudiences(tenant.id, metaAccountId);
    return NextResponse.json({ audiences });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }
}
