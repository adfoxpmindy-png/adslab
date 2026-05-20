import { LineChart } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";

export default async function InsightsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const t = await getTranslations("labs.insights");
  // Locale-less base — next-intl's <Link> (via LabPage) auto-prepends the
  // active locale, and usePathname() returns the path without the locale.
  const base = `/t/${tenantSlug}/insights`;
  const tabs = [
    { key: "overview", label: t("tabs.overview"), href: base },
    { key: "reports", label: t("tabs.reports"), href: `${base}/reports` },
    { key: "journey", label: t("tabs.journey"), href: `${base}/journey` },
    { key: "competitors", label: t("tabs.competitors"), href: `${base}/competitors` },
  ];
  return (
    <LabPage title={t("title")} description={t("description")} icon={LineChart} tabs={tabs}>
      {children}
    </LabPage>
  );
}
