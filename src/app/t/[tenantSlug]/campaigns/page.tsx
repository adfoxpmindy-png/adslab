import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { CampaignsV2Client, type CampaignRow } from "@/components/tenant/campaigns-v2-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { getEffectiveScope, applyScopeFilter } from "@/lib/tenant-scope";
import { getDashboardData, filterDashboardPayload } from "@/lib/meta/dashboard-service";
import type { ParsedCampaignInsight } from "@/lib/meta/insights";

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ highlight?: string }>;
}) {
  const { tenantSlug } = await params;
  const { highlight } = await searchParams;
  const session = await requireSession();
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const scope = await getEffectiveScope(session.userId, tenant.id);
  const scopeFilter = applyScopeFilter(scope);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  void highlight;
  if (!isConnected) {
    return (
      <>
        <SetPageTitle title="แคมเปญ" subtitle="จัดการและวางแผนแคมเปญของคุณ" />
        <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">ต้องเชื่อมต่อ Meta ก่อนใช้งาน</p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              ไปที่ Settings
            </Link>
          </Card>
        </div>
      </>
    );
  }

  const [campaigns, accounts, insightsResult] = await Promise.all([
    prisma.metaCampaign.findMany({
      where: {
        metaConnectionId: connection!.id,
        ...scopeFilter,
      },
      orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
      select: {
        id: true,
        metaCampaignId: true,
        metaAccountId: true,
        name: true,
        metaObjective: true,
        effectiveStatus: true,
        configuredStatus: true,
        dailyBudget: true,
        lifetimeBudget: true,
        endTime: true,
      },
    }),
    prisma.metaAdAccount.findMany({
      where: {
        metaConnectionId: connection!.id,
        ...(scope.accountIds !== null ? { metaAccountId: { in: scope.accountIds } } : {}),
      },
      select: { metaAccountId: true, name: true, businessName: true },
    }),
    getDashboardData(tenant.id, "last_30d").catch(() => null),
  ]);

  const accountById = new Map(
    accounts.map((a) => [a.metaAccountId, { name: a.name, business: a.businessName }]),
  );

  // Build per-campaign metrics map from cached insights (30-day window).
  const insightsByCampaignId = new Map<string, ParsedCampaignInsight>();
  if (insightsResult) {
    const filtered = filterDashboardPayload(insightsResult.payload, scope.accountIds);
    for (const account of filtered.accounts) {
      for (const c of account.campaigns) {
        insightsByCampaignId.set(c.campaignId, c);
      }
    }
  }

  const rows: CampaignRow[] = campaigns.map((c) => {
    const account = accountById.get(c.metaAccountId);
    const insight = insightsByCampaignId.get(c.metaCampaignId);
    return {
      id: c.id,
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      metaObjective: c.metaObjective,
      effectiveStatus: c.effectiveStatus,
      configuredStatus: c.configuredStatus,
      dailyBudget: c.dailyBudget,
      lifetimeBudget: c.lifetimeBudget,
      endTime: c.endTime?.toISOString() ?? null,
      account: {
        id: c.metaAccountId,
        name: account?.name ?? c.metaAccountId,
        business: account?.business ?? null,
      },
      metrics: {
        spend: insight?.spend ?? 0,
        purchaseValue: insight?.purchaseValue ?? 0,
        roas: insight?.roas ?? 0,
        impressions: insight?.impressions ?? 0,
        clicks: insight?.clicks ?? 0,
        ctr: insight?.ctr ?? 0,
        cpc: insight?.cpc ?? 0,
        conversions: insight?.conversions ?? 0,
      },
    };
  });

  return <CampaignsV2Client tenantSlug={tenantSlug} canEdit={canEdit} campaigns={rows} />;
}
