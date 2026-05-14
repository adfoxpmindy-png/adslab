import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { deleteCreative } from "@/lib/creatives/service";

/**
 * DELETE /api/creatives/{id}?tenantSlug=<slug>
 * Soft-deletes the creative + removes the blob from storage.
 * OWNER + MEDIA_BUYER only — destructive op.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const { id } = await params;
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const result = await deleteCreative({ tenantId: tenant.id, creativeId: id });
  if (!result.ok) {
    const status = result.error === "creative not found" ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
