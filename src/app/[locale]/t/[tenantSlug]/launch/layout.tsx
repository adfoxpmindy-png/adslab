import { Megaphone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LabPage } from "@/components/ui-system/lab-page";

export default async function LaunchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const t = await getTranslations("labs.launch");
  const base = `/t/${tenantSlug}/launch`;
  const tabs = [
    { key: "ads", label: t("tabs.ads"), href: base },
    { key: "boost", label: t("tabs.boost"), href: `${base}/boost` },
    { key: "campaigns", label: t("tabs.campaigns"), href: `${base}/campaigns` },
    { key: "new", label: t("tabs.new"), href: `${base}/new` },
    { key: "aiNew", label: t("tabs.aiNew"), href: `${base}/ai-new` },
    { key: "history", label: t("tabs.history"), href: `${base}/history` },
    { key: "audiences", label: t("tabs.audiences"), href: `${base}/audiences` },
    { key: "creatives", label: t("tabs.creatives"), href: `${base}/creatives` },
    { key: "posts", label: t("tabs.posts"), href: `${base}/posts` },
  ];
  return (
    <LabPage
      title={t("title")}
      description={t("description")}
      icon={<Megaphone className="size-4" />}
      tabs={tabs}
    >
      {children}
    </LabPage>
  );
}
