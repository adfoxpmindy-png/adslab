import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowRight, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { MetaIcon } from "@/components/icons/meta";
import { cn } from "@/lib/utils";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";

type KpiTone = "positive" | "negative" | "neutral";

type KpiPlaceholder = {
  label: string;
  value: string;
  delta: string;
  tone: KpiTone;
};

const PLACEHOLDER_KPIS: KpiPlaceholder[] = [
  { label: "Total Spend", value: "฿0", delta: "—", tone: "neutral" },
  { label: "Impressions", value: "0", delta: "—", tone: "neutral" },
  { label: "Clicks", value: "0", delta: "—", tone: "neutral" },
  { label: "Conversions", value: "0", delta: "—", tone: "neutral" },
];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTenantMember(tenantSlug);

  // Show the "Connect Meta" empty state if no connection yet.
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true, status: true, adAccounts: { select: { id: true }, take: 1 } },
  });
  const isConnected = connection !== null && connection.status === "ACTIVE";

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">
          ภาพรวมแคมเปญทั้งหมดจะแสดงที่นี่
        </p>
      </header>

      {!isConnected ? (
        <ConnectMetaCta tenantSlug={tenantSlug} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {PLACEHOLDER_KPIS.map((kpi) => (
              <KpiCard key={kpi.label} kpi={kpi} />
            ))}
          </div>

          <Card className="flex flex-col items-center justify-center gap-3 border-dashed bg-background/40 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">เชื่อม Meta เรียบร้อย — รอ AI Daily Report</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              KPI ตัวเลขจริง + insights จะแสดงเมื่อ proposal{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">add-unified-dashboard</code>{" "}
              และ <code className="rounded bg-muted px-1.5 py-0.5 text-xs">add-ai-daily-report</code> ทำเสร็จ
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function ConnectMetaCta({ tenantSlug }: { tenantSlug: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[#1877F2]/10">
        <MetaIcon className="size-7 text-[#1877F2]" />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">เชื่อม Meta เพื่อเริ่มใช้งาน</h2>
        <p className="text-sm text-muted-foreground">
          เชื่อมต่อ Facebook Business Manager ของคุณกับ AdsLab เพื่อให้ AI วิเคราะห์
          และ optimize แคมเปญของคุณได้ทุกวัน
        </p>
      </div>
      <Link
        href={`/t/${tenantSlug}/settings/integrations`}
        className={cn(buttonVariants({ size: "lg" }), "gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]")}
      >
        <MetaIcon className="size-4" />
        Connect Meta
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}

function KpiCard({ kpi }: { kpi: KpiPlaceholder }) {
  const deltaColor =
    kpi.tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : kpi.tone === "negative"
        ? "text-destructive"
        : "text-muted-foreground";
  const Icon =
    kpi.tone === "positive" ? ArrowUpRight : kpi.tone === "negative" ? ArrowDownRight : null;

  return (
    <Card className="flex flex-col gap-2 p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
      <p className="text-3xl font-semibold tracking-tight">{kpi.value}</p>
      <p className={`flex items-center gap-1 text-xs ${deltaColor}`}>
        {Icon && <Icon className="size-3" />}
        <span>{kpi.delta}</span>
      </p>
    </Card>
  );
}
