import { Workflow } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";

export default async function AutomationLabLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenantSlug: string }>;
}) {
  const { locale, tenantSlug } = await params;
  const t = await getTranslations("labs.automation");
  const base = `/${locale}/t/${tenantSlug}/automation-lab`;
  const tabs = [
    { key: "rules", label: t("tabs.rules"), href: base },
    { key: "goals", label: t("tabs.goals"), href: `${base}/goals` },
    { key: "naming", label: t("tabs.naming"), href: `${base}/naming` },
    { key: "events", label: t("tabs.events"), href: `${base}/events` },
  ];
  return (
    <LabPage title={t("title")} description={t("description")} icon={Workflow} tabs={tabs}>
      {children}
    </LabPage>
  );
}
