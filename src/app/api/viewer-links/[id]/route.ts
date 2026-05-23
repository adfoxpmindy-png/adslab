import { type NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";

/**
 * DELETE /api/viewer-links/[id] — revoke a viewer link (soft delete).
 * Sets isActive=false; the row stays so viewCount + lastViewedAt
 * survive for audit. Subsequent /v/<token> hits return 404.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  const link = await prisma.viewerLink.findUnique({
    where: { id },
    select: { id: true, tenantId: true, isActive: true, tenant: { select: { slug: true } } },
  });

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  // Role-gate via the link's owning tenant.
  await requireTenantMember(link.tenant.slug, ["OWNER", "MEDIA_BUYER"]);

  if (!link.isActive) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await prisma.viewerLink.update({
    where: { id: link.id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
