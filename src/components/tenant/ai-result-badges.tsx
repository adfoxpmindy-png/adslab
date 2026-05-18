"use client";

import { CheckCircle2, XCircle, Clock, AlertTriangle, Trash2, Info, Target } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { OutcomeBadge } from "@/lib/reports/enrich-suggestions";
import type { ConfidenceResult } from "@/lib/ai/recommendation-stats";

const METRIC_LABEL: Record<string, string> = {
  roas: "ROAS",
  cpv: "CPV",
  ctr: "CTR",
  cpm: "CPM",
  spend: "Spend",
};

function fmtPercent(p: number): string {
  if (p > 0) return `+${p.toFixed(0)}%`;
  return `${p.toFixed(0)}%`;
}

export function OutcomeBadgeView({ badge }: { badge: OutcomeBadge }) {
  const t = useTranslations("pages.reports.badges");
  if (badge.kind === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Clock className="size-3" /> {t("pending")}
      </span>
    );
  }
  if (badge.kind === "ignored") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <XCircle className="size-3" /> {t("ignored")}
      </span>
    );
  }
  if (badge.kind === "target_deleted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <Trash2 className="size-3" /> {t("targetDeleted")}
      </span>
    );
  }
  if (badge.kind === "no_data") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <Info className="size-3" /> {t("noData")}
      </span>
    );
  }
  // followed-* — show KPI delta when present
  const metric = badge.metricLabel ? METRIC_LABEL[badge.metricLabel] ?? badge.metricLabel : null;
  const delta =
    badge.percentChange !== undefined && metric
      ? `· ${metric} ${fmtPercent(badge.percentChange)}`
      : "";

  if (badge.kind === "followed-positive") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="size-3" /> {t("followed")} {delta}
      </span>
    );
  }
  if (badge.kind === "followed-negative") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="size-3" /> {t("followed")} {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
      <CheckCircle2 className="size-3" /> {t("followed")} {delta}
    </span>
  );
}

export function ConfidenceBadgeView({
  result,
  className,
}: {
  result: ConfidenceResult | null;
  className?: string;
}) {
  const t = useTranslations("pages.reports.badges");
  if (!result) return null;
  const tone =
    result.percent >= 70
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : result.percent >= 50
        ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        tone,
        className,
      )}
      title={t("confidenceTooltip", { successful: result.successful, total: result.total, percent: result.percent })}
    >
      <Target className="size-3" />
      {t("confidenceLabel", { total: result.total, percent: result.percent })}
    </span>
  );
}
