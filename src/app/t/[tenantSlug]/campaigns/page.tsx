import Link from "next/link";
import { History, Megaphone, Plus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { CampaignsClient } from "@/components/tenant/campaigns-client";
import { getEffectiveScope, applyScopeFilter } from "@/lib/tenant-scope";

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

  if (!isConnected) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
        <header className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Megaphone className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Campaigns</p>
            <h1 className="text-2xl font-semibold tracking-tight">จัดการ Campaigns</h1>
          </div>
        </header>
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
    );
  }

  const [campaigns, accounts] = await Promise.all([
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
  ]);

  const accountById = new Map(
    accounts.map((a) => [a.metaAccountId, { name: a.name, business: a.businessName }]),
  );

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Megaphone className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Campaigns</p>
            <h1 className="text-2xl font-semibold tracking-tight">จัดการ Campaigns</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pause / Resume / แก้ budget / แก้ end date — ไม่ต้องเปิด Meta Ads Manager
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link
              href={`/t/${tenantSlug}/campaigns/new`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              <Plus className="size-3.5" />
              สร้าง Campaign
            </Link>
          )}
          <Link
            href={`/t/${tenantSlug}/campaigns/history`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-2")}
          >
            <History className="size-3.5" />
            ดูประวัติ
          </Link>
        </div>
      </header>

      <CampaignsClient
        tenantSlug={tenantSlug}
        canEdit={canEdit}
        highlightId={highlight}
        campaigns={campaigns.map((c) => {
          const account = accountById.get(c.metaAccountId);
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
          };
        })}
      />
    </div>
  );
}
