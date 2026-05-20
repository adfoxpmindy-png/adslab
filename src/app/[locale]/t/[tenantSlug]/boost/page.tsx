import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { BoostClient } from "@/components/tenant/boost-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";

export default async function BoostPage({
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
  const tPages = await getTranslations("pages.boost");

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

  if (!canEdit) {
    return (
      <>
        <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
        <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">{tPages("gate.ownerOnly")}</p>
          </Card>
        </div>
      </>
    );
  }

  const accounts = await prisma.metaAdAccount.findMany({
    where: { metaConnectionId: connection!.id, accountStatus: 1 },
    orderBy: { name: "asc" },
    select: { metaAccountId: true, name: true },
  });

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <BoostClient
          tenantSlug={tenantSlug}
          accounts={accounts.map((a) => ({ id: a.metaAccountId, name: a.name }))}
        />
      </div>
    </>
  );
}
