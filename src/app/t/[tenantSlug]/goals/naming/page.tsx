import Link from "next/link";
import { ArrowLeft, Tags } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { NamingRulesClient } from "@/components/tenant/naming-rules-client";

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
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header>
        <Link
          href={`/t/${tenantSlug}/goals`}
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          กลับไปหน้า Goals
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Tags className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Naming Rules</p>
            <h1 className="text-2xl font-semibold tracking-tight">กฎการตั้งชื่อ Campaign</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ใช้คีย์เวิร์ดในชื่อ campaign (เช่น &quot;awareness&quot;, &quot;sale&quot;) เพื่อให้ระบบ
              auto-classify ทุก campaign ที่ตรง pattern ออกเป็น objective ที่กำหนด —
              จะทำงานก่อน Meta&apos;s objective แต่หลัง manual override
            </p>
          </div>
        </div>
      </header>

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
  );
}
