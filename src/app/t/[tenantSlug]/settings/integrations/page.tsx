import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

import { MetaConnectionCard, type MetaConnectionData } from "@/components/tenant/meta-connection-card";
import { ComingSoonCard } from "@/components/tenant/coming-soon-card";
import { TenantScopeCard } from "@/components/tenant/tenant-scope-card";
import { NamingTemplatesCard } from "@/components/tenant/naming-templates-card";
import { AISettings } from "@/components/tenant/ai-settings-card";
import { SettingsTabs, type SettingsTab } from "@/components/tenant/settings-tabs";
import { MetaIcon } from "@/components/icons/meta";
import { getTenantScope } from "@/lib/tenant-scope";

type SearchParams = Promise<{
  connected?: string;
  error?: string;
  tab?: string;
}>;

function parseTab(raw: string | undefined): SettingsTab {
  if (raw === "naming" || raw === "integrations" || raw === "ai") return raw;
  return "scope";
}

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { connected, error, tab: tabRaw } = await searchParams;
  const tab = parseTab(tabRaw);
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const canEditScope = role === "OWNER";

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

  const tenantScope = await getTenantScope(tenant.id);
  const activeAccounts = connection
    ? connection.adAccounts.filter((a) => a.accountStatus === 1)
    : [];
  // Only load campaigns when the Scope tab is active — avoid pulling
  // hundreds of rows on Integrations/Naming visits.
  const campaignsForScope =
    tab === "scope" && connection
      ? await prisma.metaCampaign.findMany({
          where: { metaConnectionId: connection.id },
          orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
          select: {
            metaCampaignId: true,
            metaAccountId: true,
            name: true,
            effectiveStatus: true,
          },
        })
      : [];

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
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ตั้งค่า scope, naming convention, และ integrations ของ tenant
        </p>
      </header>

      <SettingsTabs active={tab} />

      {tab === "scope" && (
        connection && activeAccounts.length > 0 ? (
          <TenantScopeCard
            tenantSlug={tenantSlug}
            canEdit={canEditScope}
            accounts={activeAccounts.map((a) => ({
              id: a.metaAccountId,
              name: a.name,
              business: a.businessName,
            }))}
            campaigns={campaignsForScope.map((c) => ({
              id: c.metaCampaignId,
              name: c.name,
              accountId: c.metaAccountId,
              status: c.effectiveStatus,
            }))}
            initialScope={tenantScope}
          />
        ) : (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            ต้องเชื่อม Meta ก่อนถึงตั้ง scope ได้ — ไปที่ tab Integrations
          </p>
        )
      )}

      {tab === "naming" && (
        connection ? (
          <NamingTemplatesCard tenantSlug={tenantSlug} canEdit={canEditScope} />
        ) : (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            ต้องเชื่อม Meta ก่อนถึงตั้ง naming standards ได้ — ไปที่ tab Integrations
          </p>
        )
      )}

      {tab === "ai" && (
        <AISettings tenantSlug={tenantSlug} canEdit={canEditScope} />
      )}

      {tab === "integrations" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <header className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-[#1877F2]/10">
                <MetaIcon className="size-5 text-[#1877F2]" />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Meta Ads</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  เชื่อมต่อ Facebook Business Manager
                </p>
              </div>
            </header>
            <MetaConnectionCard
              tenantSlug={tenantSlug}
              role={role}
              data={data}
              flash={{ success: connected === "1", error: error ?? null }}
            />
          </section>

          <ComingSoonCard
            platform="google"
            tenantSlug={tenantSlug}
            title="Google Ads"
            description="เชื่อม Google Ads — กำลังพัฒนา"
          />

          <ComingSoonCard
            platform="tiktok"
            tenantSlug={tenantSlug}
            title="TikTok Ads"
            description="เชื่อม TikTok Ads — กำลังพัฒนา"
          />
        </div>
      )}
    </div>
  );
}
