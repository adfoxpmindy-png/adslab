import { getTranslations } from "next-intl/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { CompetitorSpyClient } from "@/components/tenant/competitor-spy-client";

export default async function CompetitorsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);
  const t = await getTranslations("pages.competitorSpy");

  // Mock data — until we wire Meta Ad Library + TikTok Creative Center
  // pollers. The UI is the same shape that those will populate.
  const competitors = generateMockCompetitors();
  const trendData = generateMockTrend();

  return (
    <>
      <SetPageTitle title={t("title")} subtitle={t("subtitle")} />
      <CompetitorSpyClient
        tenantSlug={tenantSlug}
        competitors={competitors}
        trendData={trendData}
      />
    </>
  );
}

function generateMockCompetitors() {
  return [
    { id: "1", name: "Brand A", adCount: 128, trend: 8.2, color: "#7C3AED" },
    { id: "2", name: "Brand B", adCount: 98, trend: -3.4, color: "#3B82F6" },
    { id: "3", name: "Brand C", adCount: 76, trend: 12.7, color: "#EC4899" },
    { id: "4", name: "Brand D", adCount: 64, trend: 5.1, color: "#10B981" },
    { id: "5", name: "Brand E", adCount: 53, trend: -1.8, color: "#F59E0B" },
  ];
}

function generateMockTrend() {
  // Generate 30 days of mock ad-count trend data for each brand
  const brands = ["Brand A", "Brand B", "Brand C", "Brand D", "Brand E"];
  const days = 30;
  const series = brands.map((brand, i) => {
    const base = 60 + i * 15;
    return {
      brand,
      values: Array.from({ length: days }, (_, d) => ({
        day: d + 1,
        value: Math.max(20, Math.round(base + Math.sin((d + i * 3) / 4) * 25 + Math.random() * 15)),
      })),
    };
  });
  return series;
}
