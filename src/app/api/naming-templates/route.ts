import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

/**
 * Tenant-defined naming templates surfaced in Campaign Builder as
 * suggestions. The pattern uses `{Placeholder}` syntax — see
 * naming-template.ts for the supported placeholders and rendering.
 */

const createSchema = z.object({
  name: z.string().min(1).max(120),
  pattern: z.string().min(1).max(200),
  description: z.string().max(300).optional(),
  isDefault: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug);
  const templates = await prisma.namingTemplate.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const template = await prisma.namingTemplate.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: session.userId,
      name: parsed.data.name,
      pattern: parsed.data.pattern,
      description: parsed.data.description,
      isDefault: parsed.data.isDefault,
    },
  });
  return NextResponse.json({ template });
}
