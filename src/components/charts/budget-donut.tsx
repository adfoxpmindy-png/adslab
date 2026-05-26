/**
 * Donut chart for "spent vs remaining" — pure SVG, no chart-lib dependency.
 *
 * Two arcs around a circle:
 *   - "spent" arc colored by brand
 *   - "remaining" arc in muted background
 * Center shows the headline % and value.
 *
 * Supports a "spend overflow" case (spent > budget) by clamping the arc to
 * 100% and switching the spent color to rose to flag overspend.
 */
import { cn } from "@/lib/utils";

type Props = {
  /** Total budget for the slice (denominator). */
  budget: number;
  /** Amount spent (numerator). */
  spent: number;
  /** Hex color for the spent arc when within budget. */
  brandColor: string;
  /** Display the value formatter — e.g. fmtThb. */
  formatValue: (n: number) => string;
  /** Override the center "headline" — defaults to the spent value. */
  centerLabel?: string;
  /** Size of the SVG viewport in px (square). */
  size?: number;
  /** Show the spend % label below the headline. */
  showPercent?: boolean;
};

const STROKE = 14;
const VIEW = 100;

export function BudgetDonut({
  budget,
  spent,
  brandColor,
  formatValue,
  centerLabel,
  size = 160,
  showPercent = true,
}: Props) {
  const radius = (VIEW - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const pctRaw = budget > 0 ? (spent / budget) * 100 : 0;
  const pct = Math.min(100, Math.max(0, pctRaw));
  const isOverspent = pctRaw > 100;
  const spentLen = (pct / 100) * circumference;
  const remainingLen = circumference - spentLen;

  const center = VIEW / 2;
  const spentColor = isOverspent ? "#e11d48" : brandColor;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="-rotate-90" style={{ width: size, height: size }}>
        {/* Background ring (remaining + budget visualization) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted/40"
        />
        {/* Spent arc */}
        {spent > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={STROKE}
            stroke={spentColor}
            strokeDasharray={`${spentLen} ${remainingLen}`}
            strokeLinecap="round"
            className="transition-[stroke-dasharray] duration-500"
          />
        )}
      </svg>
      {/* Center labels */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn("text-base font-semibold tabular-nums leading-tight", isOverspent ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
          {centerLabel ?? formatValue(spent)}
        </span>
        {showPercent && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {pctRaw.toFixed(1)}% ของแผน
          </span>
        )}
      </div>
    </div>
  );
}
