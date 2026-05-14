import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { MetaIcon } from "@/components/icons/meta";
import { DashboardV2Client } from "@/components/tenant/dashboard-v2-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { cn } from "@/lib/utils";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDashboardData, filterDashboardPayload } from "@/lib/meta/dashboard-service";
import { getEffectiveScope, getTenantScope } from "@/lib/tenant-scope";
import { OnboardingChecklist } from "@/components/tenant/onboarding-checklist";
import type { DashboardPayload, DateRangeKey } from "@/lib/meta/insights";

const DEFAULT_RANGE: DateRangeKey = "last_7d";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireSession();
  const { tenant, role } = await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";
  const scope = await getEffectiveScope(session.userId, tenant.id);
  const selectedIds = scope.accountIds;
  // OWNER sees the onboarding checklist until they complete all steps.
  // We snapshot the 4 setup signals here and pass to the client card.
  const isOwner = role === "OWNER";
  const tenantScopeRaw = isOwner ? await getTenantScope(tenant.id) : null;
  const scopeSet =
    tenantScopeRaw !== null &&
    (tenantScopeRaw.accountIds !== null ||
      tenantScopeRaw.campaignIds !== null ||
      tenantScopeRaw.campaignNamePatterns.length > 0);
  const [namingCount, campaignCount] = isOwner
    ? await Promise.all([
        prisma.namingTemplate.count({ where: { tenantId: tenant.id } }),
        connection
          ? prisma.metaCampaign.count({ where: { metaConnectionId: connection.id } })
          : Promise.resolve(0),
      ])
    : [0, 0];

  // Server-side fetch the first page of insights so the dashboard renders
  // with real numbers on initial paint instead of a client-side waterfall.
  // If the fetch fails (network blip, Meta rate limit), fall through to
  // a soft empty state and let the client retry.
  let initialPayload: DashboardPayload | null = null;
  let initialFromCache = false;
  let initialIsStale = false;
  if (isConnected) {
    try {
      const result = await getDashboardData(tenant.id, DEFAULT_RANGE);
      initialPayload = filterDashboardPayload(result.payload, selectedIds);
      initialFromCache = result.fromCache;
      initialIsStale = result.isStale;
    } catch (err) {
      console.warn("[dashboard] initial fetch failed:", (err as Error).message);
    }
  }

  // OnboardingChecklist + ConnectMetaCta path: when Meta not yet
  // connected, we don't render the v2 dashboard — show the connect
  // prompt instead.
  if (!isConnected) {
    return (
      <>
        <SetPageTitle title="ภาพรวม" subtitle={tenant.name} />
        <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
          {isOwner && (
            <OnboardingChecklist
              tenantSlug={tenantSlug}
              metaConnected={isConnected}
              scopeSet={scopeSet}
              hasNamingTemplate={namingCount > 0}
              hasCampaign={campaignCount > 0}
            />
          )}
          <ConnectMetaCta tenantSlug={tenantSlug} />
        </div>
      </>
    );
  }

  return (
    <>
      {isOwner && (
        <div className="mx-auto w-full max-w-screen-2xl px-6 pt-6">
          <OnboardingChecklist
            tenantSlug={tenantSlug}
            metaConnected={isConnected}
            scopeSet={scopeSet}
            hasNamingTemplate={namingCount > 0}
            hasCampaign={campaignCount > 0}
          />
        </div>
      )}
      <DashboardV2Client
        tenantSlug={tenantSlug}
        initialRange={DEFAULT_RANGE}
        initialPayload={initialPayload}
        initialFromCache={initialFromCache}
        initialIsStale={initialIsStale}
        canRefresh={role !== "VIEWER"}
      />
    </>
  );
}

function ConnectMetaCta({ tenantSlug }: { tenantSlug: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[#1877F2]/10">
        <MetaIcon className="size-7 text-[#1877F2]" />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">เชื่อม Meta เพื่อเริ่มใช้งาน</h2>
        <p className="text-sm text-muted-foreground">
          เชื่อมต่อ Facebook Business Manager ของคุณกับ AdsLab เพื่อให้ AI วิเคราะห์
          และ optimize แคมเปญของคุณได้ทุกวัน
        </p>
      </div>
      <Link
        href={`/t/${tenantSlug}/settings/integrations`}
        className={cn(buttonVariants({ size: "lg" }), "gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]")}
      >
        <MetaIcon className="size-4" />
        Connect Meta
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}
