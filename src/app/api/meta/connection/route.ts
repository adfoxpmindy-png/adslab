import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/meta/connection?tenantSlug=<slug>
 *
 * Returns the Meta connection status and cached ad accounts for the tenant.
 * Any tenant member (OWNER / MEDIA_BUYER / VIEWER) may read this.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug query param required" }, { status: 400 });
  }

  // Authorize: 404 if not a member (also handles missing tenant).
  await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findFirst({
    where: { tenant: { slug: tenantSlug } },
    select: {
      id: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
      tokenExpiresAt: true,
      adAccounts: {
        select: {
          metaAccountId: true,
          name: true,
          currency: true,
          timezoneName: true,
          accountStatus: true,
          businessId: true,
          businessName: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!connection) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    connection: {
      metaUserId: connection.metaUserId,
      metaUserName: connection.metaUserName,
      status: connection.status,
      connectedAt: connection.connectedAt,
      lastSyncedAt: connection.lastSyncedAt,
      tokenExpiresAt: connection.tokenExpiresAt,
      accountCount: connection.adAccounts.length,
    },
    accounts: connection.adAccounts,
  });
}
