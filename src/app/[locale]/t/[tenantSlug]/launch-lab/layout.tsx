import { Rocket } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";

export default async function LaunchLabLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenantSlug: string }>;
}) {
  const { locale, tenantSlug } = await params;
  const t = await getTranslations("labs.launch");
  const base = `/${locale}/t/${tenantSlug}/launch-lab`;
  const tabs = [
    { key: "boost", label: t("tabs.boost"), href: base },
    { key: "campaigns", label: t("tabs.campaigns"), href: `${base}/campaigns` },
    { key: "new", label: t("tabs.new"), href: `${base}/new` },
    { key: "aiNew", label: t("tabs.aiNew"), href: `${base}/ai-new` },
    { key: "history", label: t("tabs.history"), href: `${base}/history` },
  ];
  return (
    <LabPage title={t("title")} description={t("description")} icon={Rocket} tabs={tabs}>
      {children}
    </LabPage>
  );
}
