import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const existing = await prisma.knowledgeDocument.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.knowledgeDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
