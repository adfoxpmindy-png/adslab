import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("pages.aiCampaignBuilder");

  return (
    <>
      <SetPageTitle title={t("title")} subtitle={t("subtitle")} />
      <AICampaignBuilderClient tenantSlug={tenantSlug} />
    </>
  );
}
