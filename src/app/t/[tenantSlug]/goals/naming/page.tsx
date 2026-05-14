import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
        title="กฎการตั้งชื่อ Campaign"
        subtitle={'ใช้คีย์เวิร์ดในชื่อ campaign (เช่น "awareness", "sale") เพื่อให้ระบบ auto-classify ออกเป็น objective ที่กำหนด — ทำงานก่อน Meta objective แต่หลัง manual override'}
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        <Link
          href={`/t/${tenantSlug}/goals`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          กลับไปหน้า Goals
        </Link>

        {!isConnected ? (
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
            <p className="text-sm font-medium">ต้องเชื่อมต่อ Meta ก่อนใช้งาน</p>
            <Link
              href={`/t/${tenantSlug}/settings/integrations`}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              ไปที่ Settings
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
