import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { getEffectiveScope } from "@/lib/tenant-scope";
import { AdsClient, type AdRow } from "@/components/tenant/ads-client";

import { getVisionQuotaRemaining } from "./_actions/analyze-creative";

const PAGE_SIZE = 30;

export default async function AdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status } = await searchParams;
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);
  const scope = await getEffectiveScope(session.userId, tenant.id);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";

  if (!isConnected) {
    return (
      <>
        <SetPageTitle title="โฆษณา" subtitle="ดู + วิเคราะห์ creative แต่ละชิ้น" />
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

  const statusFilter =
    status === "active"
      ? { effectiveStatus: "ACTIVE" }
      : status === "paused"
        ? { effectiveStatus: "PAUSED" }
        : {};

  const ads = await prisma.metaAd.findMany({
    where: {
      adSet: {
        campaign: {
          metaConnectionId: connection!.id,
          ...(scope.accountIds !== null
            ? { metaAccountId: { in: scope.accountIds } }
            : {}),
        },
      },
      ...statusFilter,
    },
    select: {
      id: true,
      metaAdId: true,
      name: true,
      effectiveStatus: true,
      configuredStatus: true,
      creativeAnalysis: true,
      creativeAnalyzedAt: true,
      adSet: {
        select: {
          name: true,
          campaign: {
            select: {
              name: true,
              metaAccountId: true,
            },
          },
        },
      },
    },
    orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
    take: PAGE_SIZE,
  });

  const accountIds = Array.from(
    new Set(ads.map((a) => a.adSet.campaign.metaAccountId)),
  );
  const accountRecords = accountIds.length
    ? await prisma.metaAdAccount.findMany({
        where: { metaConnectionId: connection!.id, metaAccountId: { in: accountIds } },
        select: { metaAccountId: true, name: true },
      })
    : [];
  const accountNameById = new Map(
    accountRecords.map((a) => [a.metaAccountId, a.name]),
  );

  const quotaRemaining = await getVisionQuotaRemaining(tenantSlug);

  const rows: AdRow[] = ads.map((a) => ({
    id: a.id,
    metaAdId: a.metaAdId,
    name: a.name,
    effectiveStatus: a.effectiveStatus,
    configuredStatus: a.configuredStatus,
    adSetName: a.adSet.name,
    campaignName: a.adSet.campaign.name,
    accountName:
      accountNameById.get(a.adSet.campaign.metaAccountId) ??
      a.adSet.campaign.metaAccountId,
    creativeAnalysis: a.creativeAnalysis as AdRow["creativeAnalysis"],
    creativeAnalyzedAt: a.creativeAnalyzedAt?.toISOString() ?? null,
  }));

  return (
    <>
      <SetPageTitle title="โฆษณา" subtitle="ดู + วิเคราะห์ creative ของ ad แต่ละชิ้น" />
      <div className="mx-auto w-full max-w-screen-2xl space-y-4 px-6 py-6">
        <AdsClient
          tenantSlug={tenantSlug}
          ads={rows}
          quotaRemaining={quotaRemaining}
          activeStatus={status ?? "all"}
        />
      </div>
    </>
  );
}
