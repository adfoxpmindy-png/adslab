import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { MetricDelta } from "./metric-delta";

/**
 * Headline metric card — used at the top of dashboards.
 *
 * Layout: colored icon circle (left) + label + big value + delta vs
 * previous period. Matches the mockup pattern of 4 cards in a row at
 * the top of Overview / Optimization / Competitor pages.
 */
export type KpiCardProps = {
  /** Short label e.g. "Total spend" */
  label: string;
  /** The big number — pre-formatted string (e.g. "฿124,560" or "4.32") */
  value: React.ReactNode;
  /** Optional delta vs comparison period (%). Pass numeric float */
  delta?: number;
  /** Helper text below delta, e.g. "vs Apr 1-30" */
  comparison?: string;
  /** Lucide icon to render in the colored circle */
  icon: LucideIcon;
  /** Icon circle tint — defaults to brand violet */
  tint?: "brand" | "emerald" | "amber" | "sky" | "rose" | "slate";
  /** Flip delta colors when lower-is-better (cost metrics) */
  invertDeltaColors?: boolean;
  className?: string;
};

const tintBg: Record<NonNullable<KpiCardProps["tint"]>, string> = {
  brand: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
};

export function KpiCard({
  label,
  value,
  delta,
  comparison,
  icon: Icon,
  tint = "brand",
  invertDeltaColors,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover",
        className,
      )}
    >
      <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tintBg[tint])}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {delta !== undefined && (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <MetricDelta value={delta} invertColors={invertDeltaColors} />
            {comparison && <span className="text-[11px] text-muted-foreground">{comparison}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
