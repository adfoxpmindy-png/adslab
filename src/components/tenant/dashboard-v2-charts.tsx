"use client";

// Extracted from dashboard-v2-client.tsx so recharts (~500KB) can be
// dynamic-imported. Dashboard KPI cards + tiles + table render immediately
// while these chart components lazy-load in the background.

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { ParsedInsight } from "@/lib/meta/insights";

function formatThb(value: number, locale: string): string {
  return formatCurrency(Math.round(value), locale);
}

export function DailyTrendChart({
  series,
}: {
  series: Array<{ date: string; spendThb: number; salesThb: number; roas: number }>;
}) {
  const tPages = useTranslations("pages.dashboard");
  const data = series.map((d) => ({
    date: d.date.slice(5),
    spend: Math.round(d.spendThb),
    sales: Math.round(d.salesThb),
    roas: Number(d.roas.toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 280)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.52 0.015 270)" }} />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "oklch(0.52 0.015 270)" }}
          tickFormatter={(v) => `฿${Math.round(v / 1000)}k`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "oklch(0.52 0.015 270)" }}
          tickFormatter={(v) => `${v.toFixed(1)}x`}
        />
        <Tooltip
          contentStyle={{
            background: "white",
            border: "1px solid oklch(0.92 0.005 280)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="spend"
          name={tPages("chart.spend")}
          stroke="oklch(0.58 0.20 270)"
          strokeWidth={2.5}
          dot={{ r: 2 }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="sales"
          name={tPages("chart.sales")}
          stroke="oklch(0.72 0.16 155)"
          strokeWidth={2.5}
          dot={{ r: 2 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="roas"
          name={tPages("chart.roas")}
          stroke="oklch(0.72 0.18 340)"
          strokeWidth={2}
          strokeDasharray="3 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PerAccountBarChart({ accounts }: { accounts: ParsedInsight[] }) {
  const tPages = useTranslations("pages.dashboard");
  const data = useMemo(
    () =>
      [...accounts]
        .filter((a) => a.spend > 0)
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10)
        .map((a) => ({
          name: a.accountName.length > 20 ? `${a.accountName.slice(0, 20)}…` : a.accountName,
          spend: Math.round(a.spend),
          sales: Math.round(a.purchaseValue),
          roas: a.roas,
        })),
    [accounts],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        {tPages("chart.noData")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 280)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.52 0.015 270)" }} />
        <YAxis tick={{ fontSize: 11, fill: "oklch(0.52 0.015 270)" }} />
        <Tooltip
          contentStyle={{
            background: "white",
            border: "1px solid oklch(0.92 0.005 280)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="spend"
          name={tPages("chart.spend")}
          stroke="oklch(0.58 0.20 270)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="sales"
          name={tPages("chart.sales")}
          stroke="oklch(0.72 0.16 155)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PlatformDonut({ spendThb }: { spendThb: number }) {
  const tPages = useTranslations("pages.dashboard");
  const locale = useLocale();
  const platforms = [
    { name: "Meta", value: spendThb, color: "oklch(0.58 0.20 270)" },
    { name: "Google", value: 0, color: "oklch(0.61 0.22 295)" },
    { name: "TikTok", value: 0, color: "oklch(0.72 0.18 340)" },
    { name: "YouTube", value: 0, color: "oklch(0.72 0.16 155)" },
  ];
  const visible = platforms.filter((p) => p.value > 0);
  const total = visible.reduce((s, p) => s + p.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {tPages("platform.noSpend")}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              dataKey="value"
            >
              {visible.map((p) => (
                <Cell key={p.name} fill={p.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{tPages("platform.totalSpend")}</p>
          <p className="text-base font-bold tabular-nums">{formatThb(total, locale)}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {platforms.map((p) => {
          const pct = total > 0 ? (p.value / total) * 100 : 0;
          return (
            <li key={p.name} className="flex items-center gap-2 text-xs">
              <span
                className={cn("size-2 shrink-0 rounded-full", p.value === 0 && "opacity-30")}
                style={{ backgroundColor: p.color }}
              />
              <span className={cn("flex-1", p.value === 0 && "text-muted-foreground")}>
                {p.name}
              </span>
              <span className="tabular-nums text-muted-foreground">{formatThb(p.value, locale)}</span>
              <span className="w-12 text-right tabular-nums">{pct.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
