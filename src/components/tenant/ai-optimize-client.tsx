"use client";

import { useMemo, useState } from "react";
import {
  CircleDollarSign,
  ImageIcon,
  Layers,
  Lightbulb,
  MoreHorizontal,
  Pause,
  PiggyBank,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import {
  BrandButton,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadRow,
  DataTableRow,
  DataTableShell,
  EmptyState,
  KpiCard,
  StatusBadge,
} from "@/components/ui-system";
import { cn } from "@/lib/utils";
import type { OptimizationRecommendation, OptimizationSummary, Severity } from "@/lib/ai/optimization-engine";

type Props = {
  tenantSlug: string;
  recommendations: OptimizationRecommendation[];
  summary: OptimizationSummary;
};

type Tab = "all" | "high" | "medium" | "low";

export function AIOptimizeClient({ tenantSlug, recommendations, summary }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    recommendations.find((r) => r.severity === "high")?.id ?? recommendations[0]?.id ?? null,
  );

  void tenantSlug;

  const filtered = useMemo(() => {
    if (tab === "all") return recommendations;
    return recommendations.filter((r) => r.severity === tab);
  }, [recommendations, tab]);

  const counts = useMemo(
    () => ({
      all: recommendations.length,
      high: recommendations.filter((r) => r.severity === "high").length,
      medium: recommendations.filter((r) => r.severity === "medium").length,
      low: recommendations.filter((r) => r.severity === "low").length,
    }),
    [recommendations],
  );

  const selected = useMemo(
    () => recommendations.find((r) => r.id === selectedId) ?? null,
    [recommendations, selectedId],
  );

  const isEmpty = recommendations.length === 0;

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="โอกาสในการปรับปรุง"
          value={summary.totalCount.toString()}
          icon={Sparkles}
          tint="brand"
        />
        <KpiCard
          label="คาดการณ์ ROAS เพิ่มขึ้น"
          value={`+${summary.predictedRoasUpliftPct.toFixed(1)}%`}
          icon={TrendingUp}
          tint="emerald"
        />
        <KpiCard
          label="ประหยัดงบประมาณได้"
          value={formatThb(summary.potentialMonthlySavingsThb)}
          icon={PiggyBank}
          tint="amber"
        />
        <KpiCard
          label="แคมเปญที่ได้รับผลกระทบ"
          value={summary.affectedCampaignCount.toString()}
          icon={Layers}
          tint="sky"
        />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={Sparkles}
          title="แคมเปญของคุณทำงานได้ดีอยู่แล้ว"
          description="ตอนนี้ AI ยังไม่พบจุดที่ต้องปรับปรุง — ลองมาเช็คใหม่อีกครั้งใน 24 ชั่วโมง หรือเพิ่มงบให้แคมเปญที่ทำได้ดีเพื่อ scale"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Left: Recommendations table */}
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-card">
                {(["all", "high", "medium", "low"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                      tab === t
                        ? "bg-brand-gradient text-white shadow-card"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {labelForTab(t)} ({counts[t]})
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <RefreshCw className="size-3.5" />
                รีเฟรชข้อมูล
              </button>
            </div>

            <RecommendationsTable
              rows={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Right: Detail panel */}
          <DetailPanel rec={selected} />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Recommendations table
// =============================================================================

function RecommendationsTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: OptimizationRecommendation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="ไม่มีคำแนะนำในระดับนี้"
        description="ลองดูที่ tab อื่น หรือกดรีเฟรชเพื่อให้ AI วิเคราะห์ใหม่"
      />
    );
  }

  return (
    <DataTableShell>
      <DataTableHead>
        <DataTableHeadRow>
          <DataTableHeadCell>คำแนะนำ</DataTableHeadCell>
          <DataTableHeadCell>แคมเปญ/ชุดโฆษณา</DataTableHeadCell>
          <DataTableHeadCell>เหตุผล</DataTableHeadCell>
          <DataTableHeadCell>ผลลัพธ์ที่คาดว่าจะได้รับ</DataTableHeadCell>
          <DataTableHeadCell>ความสำคัญ</DataTableHeadCell>
          <DataTableHeadCell className="text-right">การดำเนินการ</DataTableHeadCell>
        </DataTableHeadRow>
      </DataTableHead>
      <DataTableBody>
        {rows.map((r) => {
          const Icon = actionIcon(r.actionKind);
          const isSelected = r.id === selectedId;
          return (
            <DataTableRow
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={cn(
                "cursor-pointer",
                isSelected && "bg-accent/40 hover:bg-accent/40",
              )}
            >
              <DataTableCell>
                <div className="flex items-start gap-2">
                  <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", actionTint(r.actionKind))}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium" title={r.title}>
                      {r.title}
                    </p>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">{r.subtitle}</p>
                  </div>
                </div>
              </DataTableCell>
              <DataTableCell>
                <p className="line-clamp-1 text-xs font-medium" title={r.campaignName}>
                  {truncate(r.campaignName, 30)}
                </p>
                <p className="text-[10px] text-muted-foreground">{r.accountName}</p>
              </DataTableCell>
              <DataTableCell>
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {r.reasons.slice(0, 2).map((reason, i) => (
                    <li key={i} className="flex gap-1">
                      <span className="text-foreground/40">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </DataTableCell>
              <DataTableCell>
                <p className={cn("text-xs font-semibold", impactColor(r.actionKind))}>
                  {r.predictedImpact}
                </p>
              </DataTableCell>
              <DataTableCell>
                <SeverityBadge severity={r.severity} />
              </DataTableCell>
              <DataTableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.success("ใช้คำแนะนำแล้ว (demo — ยังไม่ apply จริง)");
                    }}
                    className="rounded-lg bg-brand-gradient px-2.5 py-1 text-[11px] font-medium text-white shadow-card transition-all hover:-translate-y-0.5"
                  >
                    ใช้คำแนะนำ
                  </button>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTableShell>
  );
}

// =============================================================================
// Right detail panel
// =============================================================================

function DetailPanel({ rec }: { rec: OptimizationRecommendation | null }) {
  if (!rec) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
        เลือกคำแนะนำในตารางเพื่อดูรายละเอียด
      </div>
    );
  }

  return (
    <aside className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          คำแนะนำสำหรับคุณ
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          <Sparkles className="size-3" />
          AI
        </span>
      </div>

      <div>
        <h3 className="text-lg font-bold tracking-tight">{rec.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          ใน {rec.subtitle} ของแคมเปญ <span className="text-foreground">{rec.campaignName}</span>
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">เหตุผล</p>
        <ul className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          {rec.reasons.map((reason, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs text-foreground/80">
              <span className="text-brand-violet">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">ประสิทธิภาพปัจจุบัน</p>
        <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <Stat label="ROAS" value={rec.currentMetrics.roas > 0 ? `${rec.currentMetrics.roas.toFixed(2)}x` : "—"} />
          <Stat label="CTR" value={`${rec.currentMetrics.ctr.toFixed(2)}%`} />
          <Stat label="Spend" value={formatThb(rec.currentMetrics.spend)} />
        </dl>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">ผลลัพธ์ที่คาดว่าจะได้รับ</p>
        <div className={cn("rounded-lg border p-3 text-sm font-semibold", "border-success/30 bg-success/10 text-success")}>
          <CircleDollarSign className="mb-1 size-4" />
          {rec.predictedImpact}
        </div>
      </div>

      <button
        type="button"
        onClick={() => toast.success("ใช้คำแนะนำแล้ว (demo)")}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient py-3 text-sm font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
      >
        ใช้คำแนะนำนี้
      </button>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xs font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === "high") return <StatusBadge variant="destructive">สูง</StatusBadge>;
  if (severity === "medium") return <StatusBadge variant="warning">กลาง</StatusBadge>;
  return <StatusBadge variant="info">ต่ำ</StatusBadge>;
}

function actionIcon(kind: OptimizationRecommendation["actionKind"]) {
  switch (kind) {
    case "pause_adset":
      return Pause;
    case "increase_budget":
      return TrendingUp;
    case "decrease_budget":
      return TrendingDown;
    case "refresh_creative":
      return ImageIcon;
    case "expand_audience":
      return Target;
  }
}

function actionTint(kind: OptimizationRecommendation["actionKind"]): string {
  switch (kind) {
    case "pause_adset":
      return "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300";
    case "increase_budget":
      return "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "decrease_budget":
      return "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300";
    case "refresh_creative":
      return "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300";
    case "expand_audience":
      return "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300";
  }
}

function impactColor(kind: OptimizationRecommendation["actionKind"]): string {
  switch (kind) {
    case "pause_adset":
    case "decrease_budget":
      return "text-success";
    case "increase_budget":
      return "text-success";
    case "refresh_creative":
    case "expand_audience":
      return "text-info";
  }
}

function labelForTab(t: Tab): string {
  if (t === "all") return "ทั้งหมด";
  if (t === "high") return "ความสำคัญสูง";
  if (t === "medium") return "ความสำคัญกลาง";
  return "ความสำคัญต่ำ";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const thbFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

function formatThb(value: number): string {
  return thbFormatter.format(Math.round(value));
}
