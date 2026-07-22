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

import { IMPACT_BY_FINDING } from "@/lib/pitch/baanyen-charts";

// Emerald scale: deepest for the largest impact finding.
const EMERALD_SCALE = [
  "#047857",
  "#059669",
  "#10b981",
  "#34d399",
  "#6ee7b7",
];

type ChartRow = {
  label: string;
  impact: number;
  code: string;
  title: string;
};

const data: ChartRow[] = IMPACT_BY_FINDING.map((r) => ({
  label: `${r.code} ${r.title}`,
  impact: r.impactThb,
  code: r.code,
  title: r.title,
}));

export function ImpactByFindingBarChart(): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          tickFormatter={(v: number) => `฿${(v / 1000).toFixed(1)}k`}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11, fill: "#334155" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          width={150}
        />
        <Tooltip
          contentStyle={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => {
            const num = typeof value === "number" ? value : Number(value);
            return [`฿${num.toLocaleString("en-US")}/เดือน`, "Projected impact"];
          }}
        />
        <Bar dataKey="impact" radius={[0, 6, 6, 0]}>
          {data.map((row, i) => (
            <Cell key={row.code} fill={EMERALD_SCALE[i] ?? EMERALD_SCALE[EMERALD_SCALE.length - 1]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
