import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { maxActiveRulesForPlan } from "@/lib/billing/tier-rules";
import type { PlanKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { RulesClient } from "@/components/tenant/rules-client";
import type { RuleAction, RuleCondition } from "@/lib/rules/types";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

export default async function RulesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";

  const sub = await prisma.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
    select: { plan: { select: { key: true } } },
  });
  const planKey = (sub?.plan?.key as PlanKey | undefined) ?? null;
  const cap = maxActiveRulesForPlan(planKey);

  if (!isConnected) {
    return (
      <>
        <SetPageTitle
          title="กฎอัตโนมัติ"
          subtitle="ตั้ง if-then ให้ AdsLab pause/แจ้งเตือนแคมเปญตามเงื่อนไข"
        />
        <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">ต้องเชื่อมต่อ Meta ก่อนใช้กฎอัตโนมัติ</p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              ไปที่ Settings
            </Link>
          </Card>
        </div>
      </>
    );
  }

  // Pull initial rules + entity options for the form (campaign/adset picker).
  const [rules, campaigns, adSets] = await Promise.all([
    prisma.autoRule.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.metaCampaign.findMany({
      where: { metaConnectionId: connection!.id },
      select: { metaCampaignId: true, name: true },
      orderBy: { lastFetchedAt: "desc" },
      take: 200,
    }),
    prisma.metaAdSet.findMany({
      where: { campaign: { metaConnectionId: connection!.id } },
      select: { metaAdSetId: true, name: true },
      orderBy: { lastFetchedAt: "desc" },
      take: 500,
    }),
  ]);

  return (
    <>
      <SetPageTitle
        title="กฎอัตโนมัติ"
        subtitle={`ตั้ง if-then ให้ AdsLab pause/แจ้งเตือนแคมเปญตามเงื่อนไข · ใช้ ${rules.filter((r) => r.enabled).length}/${cap} ของ plan`}
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <RulesClient
          tenantSlug={tenantSlug}
          canEdit={canEdit}
          initialRules={rules.map((r) => ({
            id: r.id,
            name: r.name,
            enabled: r.enabled,
            condition: r.condition as unknown as RuleCondition,
            action: r.action as RuleAction,
            targetIds: r.targetIds,
            minIntervalMinutes: r.minIntervalMinutes,
            lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
          }))}
          cap={cap}
          planKey={planKey}
          campaigns={campaigns.map((c) => ({ id: c.metaCampaignId, name: c.name }))}
          adSets={adSets.map((a) => ({ id: a.metaAdSetId, name: a.name }))}
        />
      </div>
    </>
  );
}
