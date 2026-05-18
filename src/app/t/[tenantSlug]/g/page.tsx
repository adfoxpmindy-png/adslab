import { getTranslations } from "next-intl/server";

import { ComingSoonCard } from "@/components/tenant/coming-soon-card";

export default async function GoogleAdsComingSoonPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const t = await getTranslations("pages.googleAds");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-12">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>
      <ComingSoonCard
        platform="google"
        tenantSlug={tenantSlug}
        title={t("title")}
        description={t("cardDescription")}
      />
    </div>
  );
}
