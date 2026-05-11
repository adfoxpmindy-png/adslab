import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { MetaIcon } from "@/components/icons/meta";
import { DashboardClient } from "@/components/tenant/dashboard-client";
import { cn } from "@/lib/utils";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/lib/meta/dashboard-service";
import type { DashboardPayload, DateRangeKey } from "@/lib/meta/insights";

const DEFAULT_RANGE: DateRangeKey = "last_7d";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";

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
      initialPayload = result.payload;
      initialFromCache = result.fromCache;
      initialIsStale = result.isStale;
    } catch (err) {
      console.warn("[dashboard] initial fetch failed:", (err as Error).message);
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tenant.name}</h1>
      </header>

      {!isConnected ? (
        <ConnectMetaCta tenantSlug={tenantSlug} />
      ) : (
        <DashboardClient
          tenantSlug={tenantSlug}
          initialRange={DEFAULT_RANGE}
          initialPayload={initialPayload}
          initialFromCache={initialFromCache}
          initialIsStale={initialIsStale}
          canRefresh={role !== "VIEWER"}
        />
      )}
    </div>
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
