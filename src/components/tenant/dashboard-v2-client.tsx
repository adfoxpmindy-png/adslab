"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ChevronRight, CircleDollarSign, MousePointerClick, RefreshCw, ShoppingCart, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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

import { useLocale } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadRow,
  DataTableRow,
  DataTableShell,
  EmptyState,
  KpiCard,
  MetricDelta,
  StatusBadge,
} from "@/components/ui-system";
import { SetPageTitle } from "@/components/tenant/topbar-page-title";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/i18n/format";
import type { DashboardPayload, DateRangeKey, ParsedCampaignInsight, ParsedInsight } from "@/lib/meta/insights";

const PRESET_KEYS: DateRangeKey[] = ["today", "yesterday", "last_7d", "last_30d"];

type Props = {
  tenantSlug: string;
  initialRange: DateRangeKey;
  initialPayload: DashboardPayload | null;
  initialFromCache: boolean;
  initialIsStale: boolean;
  canRefresh: boolean;
};

export function DashboardV2Client({
  tenantSlug,
  initialRange,
  initialPayload,
  initialFromCache,
  initialIsStale,
  canRefresh,
}: Props) {
  const tPages = useTranslations("pages.dashboard");
  const locale = useLocale();
  const [range, setRange] = useState<DateRangeKey>(initialRange);
  const [payload, setPayload] = useState<DashboardPayload | null>(initialPayload);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchForRange = useCallback(
    async (r: DateRangeKey) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/meta/insights?tenantSlug=${tenantSlug}&range=${encodeURIComponent(r)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Fetch failed");
        setPayload(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tPages("toast.fetchFailed"));
      } finally {
        setLoading(false);
      }
    },
    [tenantSlug, tPages],
  );

  useEffect(() => {
    if (range === initialRange && payload?.range === initialRange) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchForRange triggers async fetch; setState happens after await, not synchronously
    void fetchForRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function handleRefresh() {
    if (!canRefresh) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/meta/insights/refresh?tenantSlug=${tenantSlug}&range=${encodeURIComponent(range)}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      setPayload(data);
      toast.success(tPages("toast.syncSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tPages("toast.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }

  const fromCache = !loading && (payload === initialPayload ? initialFromCache : false);
  const isStale = !loading && (payload === initialPayload ? initialIsStale : false);

  return (
    <>
      <SetPageTitle title={tPages("title")} subtitle={tPages("subtitle")} />

      <div className="mx-auto w-full max-w-screen-2xl space-y-6 px-6 py-6">
        {/* Top date controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-1 shadow-card">
            <Calendar className="ml-2 size-3.5 text-muted-foreground" />
            {PRESET_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  range === key
                    ? "bg-brand-gradient text-white shadow-card"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {tPages(`presets.${key}` as Parameters<typeof tPages>[0])}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {payload?.fetchedAt && (
              <span>
                {tPages("syncedAt", { when: formatDateTime(payload.fetchedAt, locale) })}
                {isStale && <span className="ml-1 text-amber-600 dark:text-amber-400">{tPages("stale")}</span>}
                {fromCache && !isStale && <span className="ml-1">{tPages("cached")}</span>}
              </span>
            )}
            {canRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="gap-1.5"
              >
                <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
                {tPages("syncBtn")}
              </Button>
            )}
          </div>
        </div>

        {loading || !payload ? (
          <DashboardSkeleton />
        ) : (
          <DashboardContent payload={payload} />
        )}
      </div>
    </>
  );
}

// =============================================================================
// Body
// =============================================================================

function DashboardContent({ payload }: { payload: DashboardPayload }) {
  const tPages = useTranslations("pages.dashboard");
  const locale = useLocale();
  const { summary, accounts } = payload;

  // Flatten campaigns across all accounts for top-performers table + counts.
  const allCampaigns = useMemo<Array<ParsedCampaignInsight & { accountName: string }>>(
    () =>
      accounts.flatMap((a) =>
        a.campaigns.map((c) => ({ ...c, accountName: a.accountName })),
      ),
    [accounts],
  );

  const counts = useMemo(() => {
    const active = allCampaigns.filter((c) => c.effectiveStatus === "ACTIVE").length;
    const paused = allCampaigns.filter((c) => c.effectiveStatus === "PAUSED").length;
    const closed = allCampaigns.filter(
      (c) => !["ACTIVE", "PAUSED"].includes(c.effectiveStatus),
    ).length;
    return { active, paused, closed, total: allCampaigns.length };
  }, [allCampaigns]);

  const topCampaigns = useMemo(
    () => [...allCampaigns].sort((a, b) => b.spend - a.spend).slice(0, 5),
    [allCampaigns],
  );

  const isEmpty = summary.spendThb === 0 && summary.impressions === 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={tPages("kpi.spend")}
          value={formatThb(summary.spendThb, locale)}
          icon={CircleDollarSign}
          tint="brand"
        />
        <KpiCard
          label={tPages("kpi.sales")}
          value={formatThb(summary.purchaseValueThb, locale)}
          icon={ShoppingCart}
          tint="emerald"
        />
        <KpiCard
          label={tPages("kpi.roas")}
          value={summary.roas > 0 ? `${summary.roas.toFixed(2)}x` : "—"}
          icon={TrendingUp}
          tint="sky"
        />
        <KpiCard
          label={tPages("kpi.clicks")}
          value={formatNumber(summary.clicks)}
          icon={MousePointerClick}
          tint="amber"
        />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={TrendingUp}
          title={tPages("empty.title")}
          description={tPages("empty.description")}
        />
      ) : (
        <>
          {/* Trend chart + Platform donut */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold tracking-tight">{tPages("trend.title")}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {payload.daily ? tPages("trend.subtitleDaily") : tPages("trend.subtitleAccount")}
                  </p>
                </div>
              </div>
              {payload.daily && payload.daily.length > 0 ? (
                <DailyTrendChart series={payload.daily} />
              ) : (
                <PerAccountBarChart accounts={accounts} />
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <h3 className="text-base font-semibold tracking-tight">{tPages("platform.title")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{tPages("platform.subtitle")}</p>
              <PlatformDonut spendThb={summary.spendThb} />
            </div>
          </div>

          {/* Activity tiles */}
          <div className="grid gap-4 md:grid-cols-3">
            <ActivityTile
              label={tPages("tile.campaigns")}
              total={counts.total}
              breakdown={[
                { label: tPages("tile.active"), count: counts.active, color: "bg-success" },
                { label: tPages("tile.paused"), count: counts.paused, color: "bg-warning" },
                { label: tPages("tile.closed"), count: counts.closed, color: "bg-muted-foreground" },
              ]}
            />
            <ActivityTile
              label={tPages("tile.accounts")}
              total={accounts.length}
              breakdown={[
                {
                  label: tPages("tile.accountActive"),
                  count: accounts.filter((a) => a.accountStatus === 1).length,
                  color: "bg-success",
                },
                {
                  label: tPages("tile.accountOther"),
                  count: accounts.filter((a) => a.accountStatus !== 1).length,
                  color: "bg-muted-foreground",
                },
              ]}
            />
            <ActivityTile
              label={tPages("tile.conversions")}
              total={summary.conversions}
              breakdown={[
                { label: tPages("tile.purchases"), count: Math.round(summary.conversions), color: "bg-info" },
              ]}
              hideZero
            />
          </div>

          {/* Top performing campaigns */}
          <TopCampaignsTable campaigns={topCampaigns} />
        </>
      )}
    </div>
  );
}

// =============================================================================
// Daily trend chart (preferred when payload.daily exists)
// =============================================================================

function DailyTrendChart({
  series,
}: {
  series: Array<{ date: string; spendThb: number; salesThb: number; roas: number }>;
}) {
  const tPages = useTranslations("pages.dashboard");
  const data = series.map((d) => ({
    date: d.date.slice(5), // MM-DD
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

// =============================================================================
// Per-account spend vs sales bar chart (fallback when daily unavailable)
// =============================================================================

function PerAccountBarChart({ accounts }: { accounts: ParsedInsight[] }) {
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

// =============================================================================
// Platform donut chart
// =============================================================================

function PlatformDonut({ spendThb }: { spendThb: number }) {
  const tPages = useTranslations("pages.dashboard");
  const locale = useLocale();
  // Currently only Meta is connected. As Google/TikTok come online, fetch
  // breakdown from a server endpoint and feed in here.
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

// =============================================================================
// Activity tile
// =============================================================================

function ActivityTile({
  label,
  total,
  breakdown,
  hideZero,
}: {
  label: string;
  total: number;
  breakdown: Array<{ label: string; count: number; color: string }>;
  hideZero?: boolean;
}) {
  const visibleBreakdown = hideZero ? breakdown.filter((b) => b.count > 0) : breakdown;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatNumber(total)}</p>
      <ul className="mt-4 space-y-2">
        {visibleBreakdown.map((b) => (
          <li key={b.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={cn("size-1.5 rounded-full", b.color)} />
              <span className="text-muted-foreground">{b.label}</span>
            </div>
            <span className="tabular-nums">{formatNumber(b.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Top campaigns table
// =============================================================================

function TopCampaignsTable({
  campaigns,
}: {
  campaigns: Array<ParsedCampaignInsight & { accountName: string }>;
}) {
  const tPages = useTranslations("pages.dashboard");
  const locale = useLocale();
  if (campaigns.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight">{tPages("top.title")}</h3>
        <span className="text-xs text-muted-foreground">{tPages("top.subtitle")}</span>
      </div>
      <DataTableShell>
        <DataTableHead>
          <DataTableHeadRow>
            <DataTableHeadCell>{tPages("top.campaign")}</DataTableHeadCell>
            <DataTableHeadCell className="text-right">{tPages("top.spend")}</DataTableHeadCell>
            <DataTableHeadCell className="text-right">{tPages("top.sales")}</DataTableHeadCell>
            <DataTableHeadCell className="text-right">ROAS</DataTableHeadCell>
            <DataTableHeadCell className="text-right">{tPages("top.clicks")}</DataTableHeadCell>
            <DataTableHeadCell className="text-right">CTR</DataTableHeadCell>
            <DataTableHeadCell className="text-right">CPC</DataTableHeadCell>
            <DataTableHeadCell>{tPages("top.status")}</DataTableHeadCell>
          </DataTableHeadRow>
        </DataTableHead>
        <DataTableBody>
          {campaigns.map((c) => (
            <DataTableRow key={c.campaignId}>
              <DataTableCell>
                <div className="min-w-0 max-w-md">
                  <p className="truncate font-medium" title={c.campaignName}>
                    {c.campaignName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={c.accountName}>
                    {c.accountName}
                  </p>
                </div>
              </DataTableCell>
              <DataTableCell numeric>{formatThb(c.spend, locale)}</DataTableCell>
              <DataTableCell numeric>{formatThb(c.purchaseValue, locale)}</DataTableCell>
              <DataTableCell numeric className="font-semibold">
                <RoasCell value={c.roas} />
              </DataTableCell>
              <DataTableCell numeric>{formatNumber(c.clicks)}</DataTableCell>
              <DataTableCell numeric>{c.ctr.toFixed(2)}%</DataTableCell>
              <DataTableCell numeric>{formatThb(c.cpc, locale)}</DataTableCell>
              <DataTableCell>
                <CampaignStatus status={c.effectiveStatus} />
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTableShell>
    </div>
  );
}

function RoasCell({ value }: { value: number }) {
  if (value <= 0) return <span className="text-muted-foreground">—</span>;
  const color = value >= 3 ? "text-success" : value >= 2 ? "text-warning" : "text-destructive";
  return <span className={color}>{value.toFixed(2)}x</span>;
}

function CampaignStatus({ status }: { status: string }) {
  const tStatus = useTranslations("status");
  if (status === "ACTIVE") return <StatusBadge variant="active">{tStatus("activeAlt")}</StatusBadge>;
  if (status === "PAUSED") return <StatusBadge variant="paused">{tStatus("pausedAlt")}</StatusBadge>;
  return <StatusBadge variant="closed">{tStatus("closed")}</StatusBadge>;
}

// =============================================================================
// Skeleton
// =============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card lg:col-span-2">
          <div className="h-72 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="h-72 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Formatters
// =============================================================================

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatThb(value: number, locale: string): string {
  return formatCurrency(Math.round(value), locale);
}
function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}
