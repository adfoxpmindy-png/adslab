import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "@/lib/meta/client";
import { graphFetch } from "@/lib/meta/graph-api";

/**
 * DELETE /api/meta/audiences/[audienceId]?tenantSlug=<slug>&metaAccountId=<id>
 *
 * Permanently deletes a custom audience in Meta. Used by the audiences
 * list page. We require the metaAccountId for ownership verification —
 * the audience must belong to one of the tenant's ad accounts.
 *
 * OWNER + MEDIA_BUYER only.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ audienceId: string }> },
) {
  const { audienceId } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const metaAccountId = url.searchParams.get("metaAccountId");
  if (!tenantSlug || !metaAccountId) {
    return NextResponse.json(
      { error: "tenantSlug + metaAccountId required" },
      { status: 400 },
    );
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  // Verify ad account ownership
  const ownsAccount = await prisma.metaAdAccount.findFirst({
    where: { metaAccountId, connection: { tenantId: tenant.id } },
    select: { id: true },
  });
  if (!ownsAccount) {
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
  }

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection) {
    return NextResponse.json({ error: "Meta connection not found" }, { status: 502 });
  }
  const accessToken = await getFreshAccessToken(connection);

  try {
    await graphFetch(`/${audienceId}`, {
      method: "DELETE",
      accessToken,
    });
  } catch (err) {
    const e = err as Error & { userMessage?: string };
    return NextResponse.json(
      { error: e.userMessage ?? e.message },
      { status: 502 },
    );
  }

  // Log the delete + invalidate cache
  await prisma.audienceCreationLog.create({
    data: {
      tenantId: tenant.id,
      userId: session.userId,
      metaAccountId,
      audienceId,
      name: "(deleted)",
      subtype: "UNKNOWN",
      sourceType: "DELETE",
    },
  });
  await prisma.metaInsightCache.deleteMany({
    where: { tenantId: tenant.id, scope: `audiences:${metaAccountId}` },
  });

  return NextResponse.json({ ok: true });
}
