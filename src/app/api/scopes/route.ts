import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { resolveUserLocale } from "@/lib/i18n/server";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  accountIds: z.array(z.string().min(1)).max(200).default([]),
  campaignIds: z.array(z.string().min(1)).max(500).default([]),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  accountIds: z.array(z.string().min(1)).max(200).optional(),
  campaignIds: z.array(z.string().min(1)).max(500).optional(),
});

/**
 * GET /api/scopes?tenantSlug=<slug>
 * List all report scopes for the tenant.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug);
  const scopes = await prisma.reportScope.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ scopes });
}

/**
 * POST /api/scopes?tenantSlug=<slug>
 * Body: { name, accountIds?, campaignIds? }
 * OWNER + MEDIA_BUYER only.
 */
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
  const { name, accountIds, campaignIds } = parsed.data;

  try {
    const scope = await prisma.reportScope.create({
      data: {
        tenantId: tenant.id,
        name,
        accountIds,
        campaignIds,
      },
    });
    return NextResponse.json({ scope });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unique constraint")) {
      const locale = await resolveUserLocale(session.userId);
      const t = await getTranslations({ locale, namespace: "api.scopes" });
      return NextResponse.json({ error: t("nameTaken") }, { status: 409 });
    }
    throw e;
  }
}

/**
 * PATCH /api/scopes?tenantSlug=<slug>
 * Body: { id, ...fields }
 */
export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { id, ...updates } = parsed.data;
  const existing = await prisma.reportScope.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const scope = await prisma.reportScope.update({ where: { id }, data: updates });
    return NextResponse.json({ scope });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unique constraint")) {
      const locale = await resolveUserLocale(session.userId);
      const t = await getTranslations({ locale, namespace: "api.scopes" });
      return NextResponse.json({ error: t("nameTaken") }, { status: 409 });
    }
    throw e;
  }
}

/**
 * DELETE /api/scopes?tenantSlug=<slug>&id=<scopeId>
 * Existing reports tied to this scope keep their data (DailyReport.scopeId
 * goes NULL via onDelete: SetNull).
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  const id = url.searchParams.get("id");
  if (!tenantSlug || !id) {
    return NextResponse.json({ error: "tenantSlug and id required" }, { status: 400 });
  }
  const { tenant } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const existing = await prisma.reportScope.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.reportScope.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
