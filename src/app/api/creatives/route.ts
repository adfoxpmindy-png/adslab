import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { listCreatives, type CreativeKind } from "@/lib/creatives/service";

/**
 * GET /api/creatives?tenantSlug=<slug>&kind=image|video&cursor=<id>
 * Paginated list of tenant creatives. All members can read.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const { tenant } = await requireTenantMember(tenantSlug);
  const kindRaw = url.searchParams.get("kind");
  const kind: CreativeKind | undefined =
    kindRaw === "image" || kindRaw === "video" ? kindRaw : undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 30);

  const result = await listCreatives({
    tenantId: tenant.id,
    kind,
    cursor,
    limit: Math.min(100, Math.max(1, limit)),
  });

  return NextResponse.json(result);
}
