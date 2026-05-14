import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { AICampaignBuilderClient } from "@/components/tenant/ai-campaign-builder-client";

export default async function AICampaignBuilderPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);

  return (
    <>
      <SetPageTitle
        title="AI Campaign Builder"
        subtitle="สร้างแคมเปญอัจฉริยะด้วย AI ภายในไม่กี่นาที"
      />
      <AICampaignBuilderClient tenantSlug={tenantSlug} />
    </>
  );
}
