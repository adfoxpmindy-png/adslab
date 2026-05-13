import { Activity } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import { EventLogClient } from "@/components/tenant/event-log-client";

export default async function EventLogPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
          <Activity className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Event Log
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">SDK Event Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ดู events ที่ SDK ยิงเข้ามา + สถานะ CAPI relay — ใช้ debug rules ก่อนรัน
            campaign จริง
          </p>
        </div>
      </header>

      <Card className="p-0">
        <EventLogClient tenantSlug={tenantSlug} />
      </Card>
    </div>
  );
}
