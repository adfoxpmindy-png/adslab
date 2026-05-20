import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { CampaignBuilderForm } from "@/components/tenant/campaign-builder-form";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { getTenantScope } from "@/lib/tenant-scope";

export default async function NewCampaignPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant, role } = await requireTenantMember(tenantSlug, ["OWNER", "MEDIA_BUYER"]);
  const t = await getTranslations("pages.campaignsNew");

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!connection || connection.status !== "ACTIVE") {
    redirect(`/t/${tenantSlug}/campaigns`);
  }

  // Apply tenant scope to the accounts list — Campaign Builder is for
  // the tenant's managed accounts only. Use TenantScope directly (not
  // effective scope) because the builder is OWNER/MEDIA_BUYER work,
  // not the user's personal filter view.
  const tenantScope = await getTenantScope(tenant.id);
  // NOTE: We don't auto-sync Pages here — it slowed page load by ~3s.
  // The form's "Refresh Pages" button calls the API on demand, and the
  // first user who visits any page-related feature triggers the sync.
  const [adAccounts, pages] = await Promise.all([
    prisma.metaAdAccount.findMany({
      where: {
        metaConnectionId: connection!.id,
        accountStatus: 1,
        ...(tenantScope.accountIds !== null
          ? { metaAccountId: { in: tenantScope.accountIds } }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { metaAccountId: true, name: true, currency: true, businessName: true },
    }),
    prisma.metaPage.findMany({
      where: { metaConnectionId: connection!.id },
      orderBy: { name: "asc" },
      select: { metaPageId: true, name: true, category: true, pictureUrl: true },
    }),
  ]);

  return (
    <>
      <SetPageTitle
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
        <Link
          href={`/t/${tenantSlug}/campaigns`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("backLink")}
        </Link>

          {pages.length === 0 ? (
          <Card className="space-y-2 border-amber-300 bg-amber-50 p-5 text-sm dark:bg-amber-950/30">
            <p className="font-medium">{t("noPages.title")}</p>
            <p className="text-muted-foreground">
              {t("noPages.body")}
            </p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              {t("noPages.settingsCta")}
            </Link>
          </Card>
        ) : adAccounts.length === 0 ? (
          <Card className="border-amber-300 bg-amber-50 p-5 text-sm dark:bg-amber-950/30">
            <p>{t("noAccounts")}</p>
          </Card>
        ) : (
          <CampaignBuilderForm
            tenantSlug={tenantSlug}
            adAccounts={adAccounts.map((a) => ({
              id: a.metaAccountId,
              name: a.name,
              currency: a.currency,
              business: a.businessName,
            }))}
            pages={pages.map((p) => ({
              id: p.metaPageId,
              name: p.name,
              category: p.category,
              pictureUrl: p.pictureUrl,
            }))}
            canEdit={role === "OWNER" || role === "MEDIA_BUYER"}
          />
        )}
      </div>
    </>
  );
}
