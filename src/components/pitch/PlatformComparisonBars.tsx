"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PLATFORM_COMPARISON } from "@/lib/pitch/baanyen-charts";

const EMERALD = "#10b981";
const ROSE = "#f43f5e";

type MetricKey = "ctr" | "cpe" | "cpm";

type ChartRow = {
  platform: string;
  value: number;
  isBetter: boolean;
};

function buildData(metric: MetricKey): ChartRow[] {
  const rows = PLATFORM_COMPARISON.map((p) => ({
    platform: p.platform,
    value: p[metric],
  }));
  // For CTR higher is better; for CPE/CPM lower is better.
  const best =
    metric === "ctr"
      ? rows.reduce((a, b) => (a.value >= b.value ? a : b))
      : rows.reduce((a, b) => (a.value <= b.value ? a : b));
  return rows.map((r) => ({ ...r, isBetter: r.platform === best.platform }));
}

function MiniBars({
  metric,
  label,
  unit,
  formatter,
}: {
  metric: MetricKey;
  label: string;
  unit: string;
  formatter: (v: number) => string;
}): React.JSX.Element {
  const data = buildData(metric);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
          barSize={40}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="platform"
            tick={{ fontSize: 11, fill: "#334155" }}
            axisLine={{ stroke: "#e5e7eb" }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => {
              const num = typeof v === "number" ? v : Number(v);
              return [formatter(num), label];
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((row) => (
              <Cell
                key={row.platform}
                fill={row.isBetter ? EMERALD : ROSE}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-xs tabular-nums text-foreground">
        {data.map((row) => (
          <div key={row.platform} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {row.platform}
            </span>
            <span className="text-sm font-semibold">{formatter(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlatformComparisonBars(): React.JSX.Element {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      <MiniBars
        metric="ctr"
        label="CTR"
        unit="higher = better"
        formatter={(v) => `${v.toFixed(2)}%`}
      />
      <MiniBars
        metric="cpe"
        label="CPE"
        unit="lower = better"
        formatter={(v) => `฿${v.toFixed(2)}`}
      />
      <MiniBars
        metric="cpm"
        label="CPM"
        unit="lower = better"
        formatter={(v) => `฿${Math.round(v)}`}
      />
    </div>
  );
}
