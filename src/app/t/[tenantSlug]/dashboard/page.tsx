import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";

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

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">
          ภาพรวมแคมเปญทั้งหมดจะแสดงที่นี่ — เริ่มต้นโดยเชื่อม Meta Ad Accounts ใน Phase ถัดไป
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PLACEHOLDER_KPIS.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <Card className="flex flex-col items-center justify-center gap-3 border-dashed bg-background/40 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-5 text-primary" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">ยังไม่มีข้อมูลแสดง</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          เชื่อม Meta ad accounts ผ่าน Pipeboard ใน proposal ถัดไป (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">add-meta-integration</code>
          ) — แล้วตัวเลขจริงจะเข้ามาที่หน้านี้
        </p>
      </Card>
    </div>
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
