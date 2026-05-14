import { Card } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import { EventLogClient } from "@/components/tenant/event-log-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

export default async function EventLogPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);

  return (
    <>
      <SetPageTitle
        title="SDK Event Log"
        subtitle="ดู events ที่ SDK ยิงเข้ามา + สถานะ CAPI relay — ใช้ debug rules ก่อนรัน campaign จริง"
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <Card className="p-0">
          <EventLogClient tenantSlug={tenantSlug} />
        </Card>
      </div>
    </>
  );
}
