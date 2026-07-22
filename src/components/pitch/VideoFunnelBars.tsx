"use client";

import { FUNNEL_DROP } from "@/lib/pitch/baanyen-charts";

const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const SLATE = "#94a3b8";

type BarRow = {
  step: string;
  value: number;
  note?: string;
  tone: "good" | "warn" | "neutral";
};

function classify(step: string): BarRow["tone"] {
  if (step === "3s views") return "good";
  if (step === "ThruPlay 15s") return "warn";
  return "neutral";
}

function toneColor(tone: BarRow["tone"]): string {
  if (tone === "good") return EMERALD;
  if (tone === "warn") return AMBER;
  return SLATE;
}

function toneLabel(tone: BarRow["tone"]): string {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "warn") return "text-amber-600 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
}

const rows: BarRow[] = FUNNEL_DROP.map((r) => ({
  ...r,
  tone: classify(r.step),
}));
const max = Math.max(...rows.map((r) => r.value));

export function VideoFunnelBars(): React.JSX.Element {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = (row.value / max) * 100;
        return (
          <div key={row.step} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">{row.step}</span>
              <div className="flex items-baseline gap-2 tabular-nums">
                {row.note ? (
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${toneLabel(row.tone)}`}
                  >
                    {row.note}
                  </span>
                ) : null}
                <span className="text-sm font-semibold">
                  {row.value.toLocaleString("en-US")}
                </span>
              </div>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  backgroundColor: toneColor(row.tone),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
