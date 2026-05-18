import { getTranslations } from "next-intl/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { JourneyCanvas } from "@/components/tenant/journey/journey-canvas";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);
  const t = await getTranslations("pages.journey");

  return (
    <>
      <SetPageTitle
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mx-auto flex h-[calc(100vh-9rem)] w-full max-w-screen-2xl flex-col px-6 py-6">
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <JourneyCanvas tenantSlug={tenantSlug} />
        </div>
      </div>
    </>
  );
}
