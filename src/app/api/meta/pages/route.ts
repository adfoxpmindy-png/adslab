import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { syncPages } from "@/lib/meta/pages";

/**
 * GET /api/meta/pages?tenantSlug=<slug>&refresh=true
 *
 * Lists Facebook Pages the tenant manages. Does NOT return page access
 * tokens — those stay server-side. If `refresh=true`, re-fetches from
 * Meta first.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!connection) return NextResponse.json({ pages: [] });

  if (url.searchParams.get("refresh") === "true") {
    await syncPages(tenant.id);
  }

  const pages = await prisma.metaPage.findMany({
    where: { metaConnectionId: connection.id },
    orderBy: { name: "asc" },
    select: { metaPageId: true, name: true, category: true, pictureUrl: true },
  });

  return NextResponse.json({
    pages: pages.map((p) => ({
      id: p.metaPageId,
      name: p.name,
      category: p.category,
      pictureUrl: p.pictureUrl,
    })),
  });
}
