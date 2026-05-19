"use client";

// Extracted from competitor-spy-client.tsx so recharts can be dynamic-imported.
// Competitor Spy is a lower-traffic page than Dashboard, so the bundle win
// here is mainly for users who navigate AWAY from /competitors — they no
// longer pay the recharts cost.

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = Record<string, string | number>;

type Props = {
  data: ChartPoint[];
  series: Array<{ brand: string; values: Array<{ day: number; value: number }> }>;
  colors: string[];
};

export function CompetitorTrendChart({ data, series, colors }: Props) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 280)" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: "oklch(0.52 0.015 270)" }}
          interval={4}
        />
        <YAxis tick={{ fontSize: 10, fill: "oklch(0.52 0.015 270)" }} />
        <Tooltip
          contentStyle={{
            background: "white",
            border: "1px solid oklch(0.92 0.005 280)",
            borderRadius: 8,
            fontSize: 11,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line
            key={s.brand}
            type="monotone"
            dataKey={s.brand}
            stroke={colors[i % colors.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
