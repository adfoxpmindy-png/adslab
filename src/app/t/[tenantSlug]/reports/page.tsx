import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireTenantMember } from "@/lib/auth/tenant";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { ReportsClient } from "@/components/tenant/reports-client";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { getEffectiveScope, applyScopeFilter } from "@/lib/tenant-scope";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  COMPLETED: { label: "เสร็จแล้ว", tone: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300" },
  GENERATING: { label: "กำลังสร้าง...", tone: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300" },
  FAILED: { label: "ล้มเหลว", tone: "text-destructive bg-destructive/10" },
};

export default async function ReportsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ scopeId?: string }>;
}) {
  const { tenantSlug } = await params;
  const { scopeId } = await searchParams;
  const session = await requireSession();
  const { tenant, role } = await requireTenantMember(tenantSlug);
  const scope = await getEffectiveScope(session.userId, tenant.id);
  const scopeFilter = applyScopeFilter(scope);

  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true },
  });
  const canGenerate = role === "OWNER" || role === "MEDIA_BUYER";
  const isConnected = connection !== null && connection.status === "ACTIVE";

  // Load: list of scopes + reports for the selected scope (or all-tenant
  // by default). The "ทั้งหมด" view filters to scopeId IS NULL so the
  // cron-generated reports are visible.
  const [scopes, accounts, campaigns, reports] = await Promise.all([
    prisma.reportScope.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        accountIds: true,
        campaignIds: true,
      },
    }),
    connection
      ? prisma.metaAdAccount.findMany({
          where: {
            metaConnectionId: connection.id,
            ...(scope.accountIds !== null ? { metaAccountId: { in: scope.accountIds } } : {}),
          },
          orderBy: { name: "asc" },
          select: { metaAccountId: true, name: true, businessName: true },
        })
      : Promise.resolve([]),
    connection
      ? prisma.metaCampaign.findMany({
          where: {
            metaConnectionId: connection.id,
            ...scopeFilter,
          },
          orderBy: [{ effectiveStatus: "asc" }, { name: "asc" }],
          select: {
            metaCampaignId: true,
            metaAccountId: true,
            name: true,
            effectiveStatus: true,
          },
        })
      : Promise.resolve([]),
    prisma.dailyReport.findMany({
      where: {
        tenantId: tenant.id,
        scopeId: scopeId ? scopeId : null,
      },
      orderBy: { reportDate: "desc" },
      take: 30,
      select: {
        id: true,
        reportDate: true,
        status: true,
        contentMd: true,
        generatedAt: true,
        deliveredAt: true,
        estimatedCostUsd: true,
      },
    }),
  ]);

  const selectedScope =
    scopeId ? scopes.find((s) => s.id === scopeId) ?? null : null;

  return (
    <>
      <SetPageTitle
        title="รายงานประจำวัน"
        subtitle={'ฉบับ "ทั้งหมด" สร้างอัตโนมัติทุกเช้า 9 โมง — รายงาน scope กดเองตามต้องการ'}
      />
      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        {!isConnected ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-12 text-center">
          <p className="text-sm font-medium">ต้องเชื่อมต่อ Meta ก่อนใช้งาน AI Reports</p>
          <Link
            href={`/t/${tenantSlug}/settings/integrations`}
            className={cn(buttonVariants({ size: "sm" }), "gap-2")}
          >
            ไปที่ Settings
          </Link>
        </Card>
      ) : (
        <ReportsClient
          tenantSlug={tenantSlug}
          canGenerate={canGenerate}
          scopes={scopes.map((s) => ({
            id: s.id,
            name: s.name,
            accountIds: (s.accountIds as string[]) ?? [],
            campaignIds: (s.campaignIds as string[]) ?? [],
          }))}
          selectedScopeId={selectedScope?.id ?? null}
          selectedScopeName={selectedScope?.name ?? null}
          accounts={accounts.map((a) => ({
            id: a.metaAccountId,
            name: a.name,
            business: a.businessName,
          }))}
          campaigns={campaigns.map((c) => ({
            id: c.metaCampaignId,
            accountId: c.metaAccountId,
            name: c.name,
            status: c.effectiveStatus,
          }))}
          reports={reports.map((r) => ({
            id: r.id,
            reportDate: r.reportDate.toISOString().slice(0, 10),
            status: r.status,
            previewText: extractFirstSentence(r.contentMd ?? ""),
            generatedAt: r.generatedAt.toISOString(),
            deliveredAt: r.deliveredAt?.toISOString() ?? null,
            estimatedCostUsd: r.estimatedCostUsd,
          }))}
          statusLabels={STATUS_LABEL}
        />
      )}
      </div>
    </>
  );
}

function extractFirstSentence(md: string): string {
  if (!md) return "";
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("-")) return line.replace(/^-\s*/, "");
    return line.replace(/\*\*/g, "");
  }
  return "";
}
