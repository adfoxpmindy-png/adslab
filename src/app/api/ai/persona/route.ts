import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const persona = await prisma.aIPersona.findUnique({
    where: { tenantId: tenant.id },
  });
  return NextResponse.json({
    persona: persona ?? {
      role: "Thai media buyer expert",
      customInstructions: "",
      ragEnabled: true,
    },
  });
}

const putSchema = z.object({
  role: z.string().min(1).max(200),
  customInstructions: z.string().max(4000),
  ragEnabled: z.boolean(),
});

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER"]);

  const body = await request.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  await prisma.aIPersona.upsert({
    where: { tenantId: tenant.id },
    update: parsed.data,
    create: { tenantId: tenant.id, ...parsed.data },
  });
  return NextResponse.json({ ok: true });
}
