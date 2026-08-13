/**
 * GET  /api/ai/hooks/profile — read the tenant's HookProfile.
 *   Returns sensible defaults (empty strings + "both" language) when the
 *   row does not exist yet so the UI can render its Generate/Iterate forms
 *   without a null check.
 * PUT  /api/ai/hooks/profile — upsert the profile. OWNER + MEDIA_BUYER only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";

const languageSchema = z.enum(["th", "en", "both"]);

const putSchema = z.object({
  tenantSlug: z.string().min(1),
  product: z.string().min(1).max(1000),
  audience: z.string().min(1).max(1000),
  desire: z.string().min(1).max(1000),
  awarenessDefault: z
    .enum(["unaware", "problem", "solution", "product", "most-aware"])
    .nullable()
    .optional(),
  sophisticationDefault: z.number().int().min(1).max(5).nullable().optional(),
  language: languageSchema.default("both"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const profile = await prisma.hookProfile.findUnique({
    where: { tenantId: tenant.id },
  });

  if (!profile) {
    return NextResponse.json({
      ok: true,
      profile: {
        product: "",
        audience: "",
        desire: "",
        awarenessDefault: null,
        sophisticationDefault: null,
        language: "both",
        isDefault: true,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      id: profile.id,
      tenantId: profile.tenantId,
      product: profile.product,
      audience: profile.audience,
      desire: profile.desire,
      awarenessDefault: profile.awarenessDefault,
      sophisticationDefault: profile.sophisticationDefault,
      language: profile.language,
      updatedByUserId: profile.updatedByUserId,
      updatedAt: profile.updatedAt.toISOString(),
      isDefault: false,
    },
  });
}

export async function PUT(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const session = await requireSession();
  const { tenant } = await requireTenantMember(parsed.data.tenantSlug, [
    "OWNER",
    "MEDIA_BUYER",
  ]);

  const upserted = await prisma.hookProfile.upsert({
    where: { tenantId: tenant.id },
    update: {
      product: parsed.data.product,
      audience: parsed.data.audience,
      desire: parsed.data.desire,
      awarenessDefault: parsed.data.awarenessDefault ?? null,
      sophisticationDefault: parsed.data.sophisticationDefault ?? null,
      language: parsed.data.language,
      updatedByUserId: session.userId,
    },
    create: {
      tenantId: tenant.id,
      product: parsed.data.product,
      audience: parsed.data.audience,
      desire: parsed.data.desire,
      awarenessDefault: parsed.data.awarenessDefault ?? null,
      sophisticationDefault: parsed.data.sophisticationDefault ?? null,
      language: parsed.data.language,
      updatedByUserId: session.userId,
    },
  });

  return NextResponse.json({
    ok: true,
    profile: {
      id: upserted.id,
      tenantId: upserted.tenantId,
      product: upserted.product,
      audience: upserted.audience,
      desire: upserted.desire,
      awarenessDefault: upserted.awarenessDefault,
      sophisticationDefault: upserted.sophisticationDefault,
      language: upserted.language,
      updatedByUserId: upserted.updatedByUserId,
      updatedAt: upserted.updatedAt.toISOString(),
      isDefault: false,
    },
  });
}
