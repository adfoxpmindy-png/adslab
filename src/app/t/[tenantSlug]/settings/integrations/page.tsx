import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

import { MetaConnectionCard, type MetaConnectionData } from "@/components/tenant/meta-connection-card";
import { MetaIcon } from "@/components/icons/meta";

type SearchParams = Promise<{ connected?: string; error?: string }>;

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { connected, error } = await searchParams;
  const { role } = await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findFirst({
    where: { tenant: { slug: tenantSlug } },
    select: {
      id: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
      tokenExpiresAt: true,
      adAccounts: {
        select: {
          metaAccountId: true,
          name: true,
          currency: true,
          accountStatus: true,
          businessName: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  const data: MetaConnectionData = connection
    ? {
        connected: true,
        connection: {
          metaUserName: connection.metaUserName,
          status: connection.status,
          connectedAt: connection.connectedAt.toISOString(),
          lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
          tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
          accountCount: connection.adAccounts.length,
        },
        accounts: connection.adAccounts.map((a) => ({
          metaAccountId: a.metaAccountId,
          name: a.name,
          currency: a.currency,
          accountStatus: a.accountStatus,
          businessName: a.businessName,
        })),
      }
    : { connected: false };

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-[#1877F2]/10">
          <MetaIcon className="size-5 text-[#1877F2]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Meta Ads</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            เชื่อมต่อ Facebook Business Manager เพื่อให้ AdsLab อ่านข้อมูลโฆษณาและช่วย optimize
          </p>
        </div>
      </header>

      <MetaConnectionCard
        tenantSlug={tenantSlug}
        role={role}
        data={data}
        flash={{
          success: connected === "1",
          error: error ?? null,
        }}
      />
    </div>
  );
}
