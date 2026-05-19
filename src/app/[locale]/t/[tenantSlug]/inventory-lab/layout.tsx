import { Package } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";

export default async function InventoryLabLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenantSlug: string }>;
}) {
  const { locale, tenantSlug } = await params;
  const t = await getTranslations("labs.inventory");
  const base = `/${locale}/t/${tenantSlug}/inventory-lab`;
  const tabs = [
    { key: "ads", label: t("tabs.ads"), href: base },
    { key: "audiences", label: t("tabs.audiences"), href: `${base}/audiences` },
    { key: "creatives", label: t("tabs.creatives"), href: `${base}/creatives` },
    { key: "posts", label: t("tabs.posts"), href: `${base}/posts` },
    { key: "postsNew", label: t("tabs.postsNew"), href: `${base}/posts/new` },
  ];
  return (
    <LabPage title={t("title")} description={t("description")} icon={Package} tabs={tabs}>
      {children}
    </LabPage>
  );
}
