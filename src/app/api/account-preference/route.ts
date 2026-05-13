import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import {
  getSelectedAccountIds,
  setSelectedAccountIds,
} from "@/lib/account-preference";

/**
 * GET /api/account-preference?tenantSlug=<slug>
 *  → { selectedAccountIds: string[] | null }
 *
 * Returns the current user's account-filter preference for the tenant.
 * `null` = no filter set (treat as "all accounts").
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  const ids = await getSelectedAccountIds(session.userId, tenant.id);
  return NextResponse.json({ selectedAccountIds: ids });
}

const putSchema = z.object({
  // null = clear preference (= all accounts)
  ids: z.array(z.string()).nullable(),
});

/**
 * PUT /api/account-preference?tenantSlug=<slug>
 * Body: { ids: string[] | null }
 */
export async function PUT(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const body = await request.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  await setSelectedAccountIds(session.userId, tenant.id, parsed.data.ids);
  return NextResponse.json({ ok: true });
}
