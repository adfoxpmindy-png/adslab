import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { getTenantScope, setTenantScope } from "@/lib/tenant-scope";

/**
 * GET  /api/tenant-scope?tenantSlug=  → { accountIds, campaignIds }
 * PUT  /api/tenant-scope?tenantSlug=  body: { accountIds?, campaignIds? }
 *   (OWNER only)
 *
 * Tenant-wide default scope. Per-user override is separate
 * (/api/account-preference). Pages compute the effective scope as
 * the intersection of the two.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  const scope = await getTenantScope(tenant.id);
  return NextResponse.json(scope);
}

const patternSchema = z.object({
  pattern: z.string().min(1).max(200),
  kind: z.enum(["contains", "starts_with", "regex"]),
  caseInsensitive: z.boolean().optional(),
});

const putSchema = z.object({
  accountIds: z.array(z.string()).nullable(),
  campaignIds: z.array(z.string()).nullable(),
  campaignNamePatterns: z.array(patternSchema).optional().default([]),
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
  await setTenantScope(tenant.id, {
    accountIds: parsed.data.accountIds,
    campaignIds: parsed.data.campaignIds,
    campaignNamePatterns: parsed.data.campaignNamePatterns ?? [],
  });
  return NextResponse.json({ ok: true });
}
