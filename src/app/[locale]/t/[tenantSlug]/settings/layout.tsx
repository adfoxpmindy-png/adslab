import { Settings2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";
import { requireTenantMember } from "@/lib/auth/tenant";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenantSlug: string }>;
}) {
  const { locale, tenantSlug } = await params;
  await requireTenantMember(tenantSlug);
  const t = await getTranslations("labs.settings");
  const base = `/${locale}/t/${tenantSlug}/settings`;
  // Only render tabs that actually have routes. Team + Account are not
  // implemented yet — surface them in the layout when they exist.
  const tabs = [
    { key: "integrations", label: t("tabs.integrations"), href: `${base}/integrations` },
    { key: "billing", label: t("tabs.billing"), href: `${base}/billing` },
  ];
  return (
    <LabPage
      title={t("title")}
      description={t("description")}
      icon={Settings2}
      tabs={tabs}
    >
      {children}
    </LabPage>
  );
}
