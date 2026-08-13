import { getTranslations } from "next-intl/server";

import { requireTenantMember } from "@/lib/auth/tenant";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { HookLabRoot } from "@/components/hook-lab/hook-lab-root";
import { prisma } from "@/lib/prisma";
import { rowToConceptShape } from "@/lib/hooks/service";
import type {
  HookConceptShape,
  HookProfileShape,
  HookWinnerShape,
} from "@/lib/hooks/types";

export default async function HookLabPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const t = await getTranslations("pages.hookLab");
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  const [profileRow, winnerRows, conceptRows] = await Promise.all([
    prisma.hookProfile.findUnique({ where: { tenantId: tenant.id } }),
    prisma.hookWinner.findMany({
      where: { tenantId: tenant.id, cachedUntil: { gt: new Date() } },
      orderBy: [
        { purchaseRoas: "desc" },
        { ctr: "desc" },
        { spend: "desc" },
      ],
      take: 5,
    }),
    prisma.hookConcept.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const initialProfile: HookProfileShape | null = profileRow
    ? {
        id: profileRow.id,
        tenantId: profileRow.tenantId,
        product: profileRow.product,
        audience: profileRow.audience,
        desire: profileRow.desire,
        awarenessDefault: profileRow.awarenessDefault,
        sophisticationDefault: profileRow.sophisticationDefault,
        language: (profileRow.language as HookProfileShape["language"]) ?? "both",
        updatedByUserId: profileRow.updatedByUserId,
        updatedAt: profileRow.updatedAt.toISOString(),
      }
    : null;

  const initialWinners: HookWinnerShape[] = winnerRows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    metaAdId: row.metaAdId,
    metaCampaignId: row.metaCampaignId,
    metaAdSetId: row.metaAdSetId,
    textHook: row.textHook,
    body: row.body,
    creativeType:
      row.creativeType === "video" ||
      row.creativeType === "image" ||
      row.creativeType === "carousel"
        ? row.creativeType
        : null,
    visualSummary: row.visualSummary,
    dominantAttributes: Array.isArray(row.dominantAttributes)
      ? (row.dominantAttributes as unknown[]).filter(
          (s): s is string => typeof s === "string",
        )
      : null,
    spend: row.spend,
    purchaseRoas: row.purchaseRoas,
    ctr: row.ctr,
    linkClicks: row.linkClicks,
    impressions: row.impressions,
    detectedAt: row.detectedAt.toISOString(),
    cachedUntil: row.cachedUntil.toISOString(),
    warnings: Array.isArray(row.warnings)
      ? (row.warnings as Array<{ code: unknown; message: unknown }>)
          .filter(
            (w) => typeof w.code === "string" && typeof w.message === "string",
          )
          .map((w) => ({ code: w.code as string, message: w.message as string }))
      : null,
  }));

  const initialConcepts: HookConceptShape[] = conceptRows.map(rowToConceptShape);

  return (
    <>
      <SetPageTitle title={t("title")} subtitle={t("subtitle")} />
      <div className="mx-auto w-full max-w-screen-2xl space-y-4 px-6 py-6">
        <HookLabRoot
          tenantSlug={tenantSlug}
          canEdit={canEdit}
          initialProfile={initialProfile}
          initialWinners={initialWinners}
          initialConcepts={initialConcepts}
        />
      </div>
    </>
  );
}
