import { NextResponse } from "next/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listAudiences, type AudienceSummary } from "@/lib/meta/audiences";
import { getEffectiveScope } from "@/lib/tenant-scope";

/**
 * GET /api/audiences?tenantSlug=<slug>
 *
 * Aggregates audiences across ALL of the tenant's ad accounts.
 * Each row carries the ad account id + name so the UI can filter/group.
 *
 * Each per-account fetch is cached individually (see listAudiences),
 * so this is fast on repeat loads.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  const scope = await getEffectiveScope(session.userId, tenant.id);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!connection) return NextResponse.json({ audiences: [], accounts: [] });

  const accounts = await prisma.metaAdAccount.findMany({
    where: {
      metaConnectionId: connection.id,
      accountStatus: 1,
      ...(scope.accountIds !== null ? { metaAccountId: { in: scope.accountIds } } : {}),
    },
    select: { metaAccountId: true, name: true, businessName: true, currency: true },
  });

  // Fan out per-account. Sequential to avoid hammering Meta — caching
  // means most of these are no-op after the first run.
  type AudienceWithAccount = AudienceSummary & {
    accountId: string;
    accountName: string;
  };
  const all: AudienceWithAccount[] = [];
  for (const acc of accounts) {
    try {
      const audiences = await listAudiences(tenant.id, acc.metaAccountId);
      for (const a of audiences) {
        all.push({ ...a, accountId: acc.metaAccountId, accountName: acc.name });
      }
    } catch {
      // Silent skip — one ad account's failure shouldn't break the page.
    }
  }

  return NextResponse.json({
    audiences: all,
    accounts: accounts.map((a) => ({
      id: a.metaAccountId,
      name: a.name,
      business: a.businessName,
      currency: a.currency,
    })),
  });
}
