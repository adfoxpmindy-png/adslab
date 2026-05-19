import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";

export default async function InsightsLabLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenantSlug: string }>;
}) {
  const { locale, tenantSlug } = await params;
  const t = await getTranslations("labs.insights");
  const base = `/${locale}/t/${tenantSlug}/insights-lab`;
  const tabs = [
    { key: "overview", label: t("tabs.overview"), href: base },
    { key: "reports", label: t("tabs.reports"), href: `${base}/reports` },
    { key: "journey", label: t("tabs.journey"), href: `${base}/journey` },
    { key: "competitors", label: t("tabs.competitors"), href: `${base}/competitors` },
  ];
  return (
    <LabPage
      title={t("title")}
      description={t("description")}
      icon={FlaskConical}
      tabs={tabs}
    >
      {children}
    </LabPage>
  );
}
