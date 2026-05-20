import { Brain } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";

export default async function AILabLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const t = await getTranslations("labs.ai");
  const base = `/t/${tenantSlug}/ai-lab`;
  const tabs = [
    { key: "chat", label: t("tabs.chat"), href: base },
    { key: "recommendations", label: t("tabs.recommendations"), href: `${base}/recommendations` },
    { key: "memory", label: t("tabs.memory"), href: `${base}/memory` },
  ];
  return (
    <LabPage
      title={t("title")}
      description={t("description")}
      icon={<Brain className="size-4" />}
      tabs={tabs}
      showLabBadge
    >
      {children}
    </LabPage>
  );
}
