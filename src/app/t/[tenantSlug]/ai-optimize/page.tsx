import { Sparkles } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { AIOptimizeClient } from "@/components/tenant/ai-optimize-client";
import { generateRecommendations } from "@/lib/ai/optimization-engine";
import { requireSession } from "@/lib/auth/session";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { getEffectiveScope } from "@/lib/tenant-scope";
import { resolveUserLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export default async function AIOptimizePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireSession();
  const { tenant } = await requireTenantMember(tenantSlug);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";
  const tPages = await getTranslations("pages.aiOptimize");

  if (!isConnected) {
    return (
      <>
        <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
        <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
              <Sparkles className="size-5" />
            </div>
            <p className="text-sm font-medium">ต้องเชื่อมต่อ Meta ก่อนใช้งาน</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              AI Optimization Center ต้องการข้อมูลจริงจาก Meta เพื่อวิเคราะห์ + แนะนำการปรับปรุง
            </p>
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

  const scope = await getEffectiveScope(session.userId, tenant.id);
  const locale = await resolveUserLocale(session.userId);
  const { recommendations, summary } = await generateRecommendations({
    tenantId: tenant.id,
    scopeAccountIds: scope.accountIds,
    locale,
  });

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />
      <AIOptimizeClient
        tenantSlug={tenantSlug}
        recommendations={recommendations}
        summary={summary}
      />
    </>
  );
}
