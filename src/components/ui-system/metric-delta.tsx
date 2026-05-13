import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Small inline indicator showing percent change vs a comparison period.
 * Positive = success green, negative = destructive red, zero = muted neutral.
 *
 * The sign/arrow follows the value sign by default. For "lower is better"
 * metrics (cost, CPM, CPC), pass `invertColors` so a negative number
 * renders green.
 */
export type MetricDeltaProps = {
  value: number; // percentage as float, e.g. 12.3 means +12.3%
  /** Show as `+12.3%` instead of `12.3%`. Default: true */
  withSign?: boolean;
  /** Flip colors so negative=good (use for cost metrics). Default: false */
  invertColors?: boolean;
  className?: string;
  /** Optional comparison label e.g. "vs ช่วงก่อน" */
  comparison?: string;
};

export function MetricDelta({
  value,
  withSign = true,
  invertColors = false,
  className,
  comparison,
}: MetricDeltaProps) {
  const isPositive = value > 0;
  const isZero = value === 0;

  // Color logic: green if "good", red if "bad", muted if zero
  const good = invertColors ? !isPositive : isPositive;
  const color = isZero
    ? "text-muted-foreground"
    : good
      ? "text-success"
      : "text-destructive";

  const Icon = isZero ? Minus : isPositive ? ArrowUpRight : ArrowDownRight;
  const formatted = `${withSign && value > 0 ? "+" : ""}${value.toFixed(1)}%`;

  return (
    <span className={cn("inline-flex items-baseline gap-1 text-xs font-medium tabular-nums", color, className)}>
      <Icon className="size-3 self-center" />
      {formatted}
      {comparison && (
        <span className="text-muted-foreground font-normal ml-1">{comparison}</span>
      )}
    </span>
  );
}
