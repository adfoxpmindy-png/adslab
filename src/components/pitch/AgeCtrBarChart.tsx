"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ACCOUNT_AVG_CTR, AGE_BREAKDOWN } from "@/lib/pitch/baanyen-charts";

const EMERALD = "#10b981";
const SLATE = "#94a3b8";

type ChartRow = {
  age: string;
  ctr: number;
  highlight: boolean;
};

const data: ChartRow[] = AGE_BREAKDOWN.map((r) => ({
  age: r.age,
  ctr: r.ctr,
  highlight: r.age === "65+",
}));

export function AgeCtrBarChart(): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="age"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
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
            return [`${num.toFixed(2)}%`, "CTR"];
          }}
        />
        <ReferenceLine
          y={ACCOUNT_AVG_CTR}
          stroke="#64748b"
          strokeDasharray="4 4"
          label={{
            value: `avg ${ACCOUNT_AVG_CTR.toFixed(2)}%`,
            fill: "#64748b",
            fontSize: 10,
            position: "right",
          }}
        />
        <Bar dataKey="ctr" radius={[6, 6, 0, 0]}>
          {data.map((row) => (
            <Cell key={row.age} fill={row.highlight ? EMERALD : SLATE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
