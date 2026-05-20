import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

import { getTranslations } from "next-intl/server";

import { MetaConnectionCard, type MetaConnectionData } from "@/components/tenant/meta-connection-card";
import {
  PageConnectionCard,
  type PageConnectionData,
} from "@/components/tenant/page-connection-card";
import { ComingSoonCard } from "@/components/tenant/coming-soon-card";
import { TenantScopeCard } from "@/components/tenant/tenant-scope-card";
import { NamingTemplatesCard } from "@/components/tenant/naming-templates-card";
import { AISettings } from "@/components/tenant/ai-settings-card";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { MetaIcon } from "@/components/icons/meta";
import { getTenantScope } from "@/lib/tenant-scope";

type SearchParams = Promise<{
  connected?: string;
  page_connected?: string;
  sync_failed?: string;
  error?: string;
}>;

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { connected, page_connected: pageConnected, error } = await searchParams;
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

  const pageConnection = await prisma.metaPageConnection.findFirst({
    where: { tenant: { slug: tenantSlug } },
    select: {
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
      _count: { select: { managedPages: true } },
    },
  });

  const tenantScope = await getTenantScope(tenant.id);
  const tSettings = await getTranslations("settings.pageMgmt");
  const t = await getTranslations("pages.integrations");
  const activeAccounts = connection
    ? connection.adAccounts.filter((a) => a.accountStatus === 1)
    : [];

  // The scope picker needs the campaign list so users can preview which
  // campaigns each scope rule would catch. Only fetch when there's a Meta
  // connection — otherwise we render an empty-state hint instead.
  const campaignsForScope = connection
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
    <>
      <SetPageTitle title={t("title")} subtitle={t("subtitle")} />
      <div className="mx-auto w-full max-w-screen-2xl space-y-10 px-6 py-6">
        {/* 1. Platform connections — primary purpose of this page. */}
        <section className="space-y-3">
          <header className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-[#1877F2]/10">
              <MetaIcon className="size-5 text-[#1877F2]" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Meta Ads</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("metaSubtitle")}</p>
            </div>
          </header>
          <MetaConnectionCard
            tenantSlug={tenantSlug}
            role={role}
            data={data}
            flash={{ success: connected === "1", error: error ?? null }}
          />
        </section>

        <section className="space-y-3">
          <header className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300">
              <MetaIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{tSettings("title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tSettings("subtitle")}</p>
            </div>
          </header>
          <PageConnectionCard
            tenantSlug={tenantSlug}
            role={role}
            data={
              pageConnection
                ? {
                    metaUserName: pageConnection.metaUserName,
                    status: pageConnection.status,
                    connectedAt: pageConnection.connectedAt.toISOString(),
                    lastSyncedAt: pageConnection.lastSyncedAt?.toISOString() ?? null,
                    pageCount: pageConnection._count.managedPages,
                  }
                : (null as PageConnectionData)
            }
            flashSuccess={pageConnected === "1"}
          />
        </section>

        <ComingSoonCard
          platform="google"
          tenantSlug={tenantSlug}
          title="Google Ads"
          description={t("googleDesc")}
        />

        <ComingSoonCard
          platform="tiktok"
          tenantSlug={tenantSlug}
          title="TikTok Ads"
          description={t("tiktokDesc")}
        />

        {/* 2. Account scope — restricts which Meta ad accounts this tenant
            operates on. Lives here because it's a setup-time decision that
            sits on top of the Meta connection. */}
        {connection && activeAccounts.length > 0 ? (
          <section className="space-y-3 border-t border-border pt-10">
            <header>
              <h2 className="text-xl font-semibold tracking-tight">{t("scopeHeading")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("scopeSubtitle")}</p>
            </header>
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
          </section>
        ) : null}

        {/* 3. Naming templates — surface the legacy templates card so users
            who relied on it pre-IA-revision still find it. The new
            "Automation > Naming" route owns naming rules; templates are
            related but distinct and live with the integration. */}
        {connection ? (
          <section className="space-y-3 border-t border-border pt-10">
            <header>
              <h2 className="text-xl font-semibold tracking-tight">{t("namingHeading")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("namingSubtitle")}</p>
            </header>
            <NamingTemplatesCard tenantSlug={tenantSlug} canEdit={canEditScope} />
          </section>
        ) : null}

        {/* 4. AI behavior settings — kept on this page so OWNER tweaks live
            next to the Meta connection that gates them. */}
        <section className="space-y-3 border-t border-border pt-10">
          <header>
            <h2 className="text-xl font-semibold tracking-tight">{t("aiHeading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("aiSubtitle")}</p>
          </header>
          <AISettings tenantSlug={tenantSlug} canEdit={canEditScope} />
        </section>
      </div>
    </>
  );
}
