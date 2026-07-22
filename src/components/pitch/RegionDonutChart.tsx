"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { REGION_BREAKDOWN } from "@/lib/pitch/baanyen-charts";

const SLATE = "#334155";
const EMERALD_SCALE = [
  "#059669",
  "#10b981",
  "#34d399",
  "#6ee7b7",
  "#a7f3d0",
  "#d1fae5",
];

type Slice = {
  name: string;
  value: number;
  color: string;
};

const slices: Slice[] = REGION_BREAKDOWN.map((r, i) => ({
  name: r.region,
  value: r.spendPct,
  color:
    r.region === "Bangkok"
      ? SLATE
      : (EMERALD_SCALE[i - 1] ?? EMERALD_SCALE[EMERALD_SCALE.length - 1]!),
}));

const totalPct = slices.reduce((sum, s) => sum + s.value, 0);

export function RegionDonutChart(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, _name, ctx) => {
                const num = typeof value === "number" ? value : Number(value);
                const payload = (ctx as { payload?: { name?: string } } | undefined)?.payload;
                return [`${num.toFixed(1)}%`, String(payload?.name ?? "")];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Region share
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {totalPct.toFixed(0)}%
          </span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {slices.map((s) => (
          <li
            key={s.name}
            className="flex items-center gap-2 text-xs tabular-nums"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="flex-1 text-foreground">{s.name}</span>
            <span className="text-muted-foreground">{s.value.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
