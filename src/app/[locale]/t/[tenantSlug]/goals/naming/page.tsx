import { Link } from "@/i18n/routing";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { NamingRulesClient } from "@/components/tenant/naming-rules-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

export default async function NamingRulesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const t = await getTranslations("pages.naming.page");

  const [rules, sampleCampaigns, connection] = await Promise.all([
    prisma.namingConvention.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    // Sample 100 campaign names so the user can preview which campaigns
    // a pattern would match before saving the rule.
    prisma.metaCampaign.findMany({
      where: { connection: { tenantId: tenant.id } },
      orderBy: { effectiveStatus: "asc" },
      take: 100,
      select: { id: true, name: true },
    }),
    prisma.metaConnection.findUnique({
      where: { tenantId: tenant.id },
      select: { status: true },
    }),
  ]);

  const isConnected = connection !== null && connection.status === "ACTIVE";
  const canEdit = role === "OWNER" || role === "MEDIA_BUYER";

  return (
    <>
      <SetPageTitle
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <Link
          href={`/t/${tenantSlug}/goals`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("backToGoals")}
        </Link>

        {!isConnected ? (
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">{t("needMetaConnection")}</p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              {t("goToSettings")}
            </Link>
          </Card>
        ) : (
          <NamingRulesClient
            tenantSlug={tenantSlug}
            initialRules={rules}
            sampleCampaigns={sampleCampaigns}
            canEdit={canEdit}
          />
        )}
      </div>
    </>
  );
}
