import { Link } from "@/i18n/routing";
import { Tags } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveCampaignGoals } from "@/lib/goals/resolver";
import { evaluateCampaign } from "@/lib/goals/evaluator";
import { cn } from "@/lib/utils";
import { GoalsClient } from "@/components/tenant/goals-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { getEffectiveScope, applyScopeFilter } from "@/lib/tenant-scope";
import type { ParsedCampaignInsight, DashboardPayload } from "@/lib/meta/insights";


export default async function GoalsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireSession();
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const scope = await getEffectiveScope(session.userId, tenant.id);
  const scopeFilter = applyScopeFilter(scope);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";
  const tPages = await getTranslations("pages.goals");
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  if (!isConnected) {
    return (
      <>
        <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
        <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">{tPages("gate.needMeta")}</p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              {tPages("gate.cta")}
            </Link>
          </Card>
        </div>
      </>
    );
  }

  // Fetch all synced campaigns for this tenant's connection — filtered
  // by the effective scope (tenant default ∩ user override).
  const campaigns = await prisma.metaCampaign.findMany({
    where: {
      metaConnectionId: connection!.id,
      ...scopeFilter,
    },
    orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
    select: {
      id: true,
      metaCampaignId: true,
      metaAccountId: true,
      name: true,
      metaObjective: true,
      effectiveStatus: true,
    },
  });

  const goals = await resolveCampaignGoals({
    tenantId: tenant.id,
    campaigns: campaigns.map((c) => ({
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      metaObjective: c.metaObjective,
    })),
  });

  const accounts = await prisma.metaAdAccount.findMany({
    where: { metaConnectionId: connection!.id },
    select: { metaAccountId: true, name: true, businessName: true },
  });
  const accountNameById = new Map(
    accounts.map((a) => [a.metaAccountId, { name: a.name, business: a.businessName }]),
  );

  // Best-effort: pull the latest cached "last_7d" dashboard payload so we
  // can compute an on-track / off-track badge per campaign. If there's
  // no cache, the page still renders — badges just show "—".
  const cached = await prisma.metaInsightCache.findUnique({
    where: {
      tenantId_scope_rangeKey: {
        tenantId: tenant.id,
        scope: "summary",
        rangeKey: "last_7d",
      },
    },
    select: { payload: true },
  });
  const insightsByCampaignId = new Map<string, ParsedCampaignInsight>();
  if (cached?.payload) {
    const payload = cached.payload as unknown as DashboardPayload;
    for (const acc of payload.accounts ?? []) {
      for (const c of acc.campaigns ?? []) {
        insightsByCampaignId.set(c.campaignId, c);
      }
    }
  }

  const enriched = campaigns.map((c) => {
    const account = accountNameById.get(c.metaAccountId);
    const goal = goals.get(c.metaCampaignId) ?? {
      resolved: false,
      objective: null,
      source: null,
      primaryKpi: null,
      primaryTarget: null,
    };
    const insight = insightsByCampaignId.get(c.metaCampaignId);
    const evaluation =
      goal.resolved && goal.objective && insight
        ? evaluateCampaign({
            objective: goal.objective,
            primaryKpi: goal.primaryKpi,
            primaryTarget: goal.primaryTarget,
            insight,
          })
        : null;
    return {
      id: c.id,
      metaCampaignId: c.metaCampaignId,
      name: c.name,
      metaObjective: c.metaObjective,
      effectiveStatus: c.effectiveStatus,
      account: {
        id: c.metaAccountId,
        name: account?.name ?? c.metaAccountId,
        business: account?.business ?? null,
      },
      goal,
      evaluation: evaluation
        ? {
            kpi: evaluation.kpi,
            target: evaluation.target,
            actual: evaluation.actual,
            status: evaluation.status,
            customTarget: evaluation.customTarget,
          }
        : null,
    };
  });

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <div className="flex justify-end">
          <Link
            href={`/t/${tenantSlug}/goals/naming`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-2")}
          >
            <Tags className="size-3.5" />
            {tPages("namingRulesLink")}
          </Link>
        </div>

        <GoalsClient
          tenantSlug={tenantSlug}
          campaigns={enriched}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
