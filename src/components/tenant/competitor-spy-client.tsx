"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import {
  Download,
  Eye,
  Image as ImageIcon,
  Lightbulb,
  MoreHorizontal,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  brandButton,
  EmptyState,
  KpiCard,
  StatusBadge,
} from "@/components/ui-system";
import { cn } from "@/lib/utils";

type Competitor = {
  id: string;
  name: string;
  adCount: number;
  trend: number;
  color: string;
};

type TrendSeries = {
  brand: string;
  values: Array<{ day: number; value: number }>;
};

type Props = {
  tenantSlug: string;
  competitors: Competitor[];
  trendData: TrendSeries[];
};

const PLATFORMS = [
  { id: "all", labelKey: "platforms.all" },
  { id: "meta", labelKey: null },
  { id: "tiktok", labelKey: null },
  { id: "youtube", labelKey: null },
  { id: "google", labelKey: null },
] as const;

// Display names for non-translated platform IDs (used verbatim).
const PLATFORM_LITERAL: Record<string, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  youtube: "YouTube",
  google: "Google",
};

const TOP_CREATIVES = [
  { id: "1", brand: "Brand A", titleKey: "discount70", reach: "1.2M", engagement: "45K", type: "image" as const, platform: "Meta" },
  { id: "2", brand: "Brand B", titleKey: "newCream", reach: "876K", engagement: "32K", type: "video" as const, platform: "TikTok" },
  { id: "3", brand: "Brand C", titleKey: "buyOneFreeShip", reach: "654K", engagement: "28K", type: "image" as const, platform: "Meta" },
  { id: "4", brand: "Brand D", titleKey: "homeMakeover", reach: "543K", engagement: "21K", type: "video" as const, platform: "YouTube" },
];

export function CompetitorSpyClient({ tenantSlug, competitors, trendData }: Props) {
  void tenantSlug;
  const t = useTranslations("pages.competitorSpy");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]["id"]>("all");
  const [search, setSearch] = useState("");

  const totalAds = competitors.reduce((s, c) => s + c.adCount, 0);
  const avgTrend =
    competitors.reduce((s, c) => s + c.trend, 0) / Math.max(1, competitors.length);

  // Transform trend data for recharts (wide format)
  const chartData = (() => {
    const days = trendData[0]?.values.length ?? 0;
    return Array.from({ length: days }, (_, d) => {
      const point: Record<string, string | number> = { day: t("chart.xAxisDay", { n: d + 1 }) };
      for (const s of trendData) {
        point[s.brand] = s.values[d]?.value ?? 0;
      }
      return point;
    });
  })();

  const chartColors = ["#7C3AED", "#3B82F6", "#EC4899", "#10B981", "#F59E0B"];

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 px-6 py-6">
      {/* Beta banner */}
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-indigo-50 to-pink-50 px-5 py-3 text-sm dark:border-violet-900 dark:from-violet-950/30 dark:via-indigo-950/30 dark:to-pink-950/30">
        <span className="font-semibold text-violet-700 dark:text-violet-300">{t("beta.label")}</span>
        <span className="text-violet-900 dark:text-violet-200">
          {t("beta.note")}
        </span>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search.placeholder")}
          className="max-w-xs"
        />

        <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-card">
          {PLATFORMS.map((p) => {
            const label = p.labelKey ? t(p.labelKey) : PLATFORM_LITERAL[p.id] ?? p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  platform === p.id
                    ? "bg-brand-gradient text-white shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <FilterDropdown
            label={t("filter.industryLabel")}
            options={[
              t("filter.industries.all"),
              t("filter.industries.ecom"),
              t("filter.industries.beauty"),
              t("filter.industries.food"),
              t("filter.industries.travel"),
            ]}
          />
          <FilterDropdown
            label={t("filter.countryLabel")}
            options={[
              t("filter.countries.th"),
              t("filter.countries.sg"),
              t("filter.countries.my"),
              t("filter.countries.vn"),
            ]}
          />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Download className="size-3.5" />
            {t("actions.export")}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr_320px]">
        {/* Left: competitors list */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("competitors.heading")}</h3>
              <button className="flex size-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 transition-colors hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300">
                <Plus className="size-3.5" />
              </button>
            </div>
            <ul className="space-y-2">
              {competitors.map((c) => (
                <li
                  key={c.id}
                  className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
                >
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t("competitors.adsUnit", { count: c.adCount })}</p>
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium tabular-nums",
                      c.trend >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {c.trend > 0 ? "+" : ""}
                    {c.trend.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
            <button className="mt-3 w-full rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {t("actions.viewAll")}
            </button>
          </div>
        </aside>

        {/* Center: overview + trend chart */}
        <div className="space-y-4">
          {/* Overview cards */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="text-base font-semibold tracking-tight">{t("overview.heading")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("overview.subtitle")}</p>

            <div className="mt-4 grid grid-cols-4 gap-3">
              <OverviewStat label={t("overview.totalAds")} value={totalAds.toString()} delta={avgTrend} />
              <OverviewStat label={t("overview.metaLabel")} value="68%" caption={t("overview.metaCaption")} />
              <OverviewStat label={t("overview.industryLabel")} value="42%" caption={t("overview.industryCaption")} />
              <OverviewStat label={t("overview.videoLabel")} value="56%" caption={t("overview.videoCaption")} />
            </div>
          </div>

          {/* Trend chart */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-tight">{t("trend.heading")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("trend.subtitle")}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
                {trendData.map((s, i) => (
                  <Line
                    key={s.brand}
                    type="monotone"
                    dataKey={s.brand}
                    stroke={chartColors[i % chartColors.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: top creatives + AI insights */}
        <aside className="space-y-4">
          {/* Top creatives */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("creatives.heading")}</h3>
              <button className="text-[11px] font-medium text-violet-600 hover:underline">{t("actions.viewAll")}</button>
            </div>
            <ul className="space-y-3">
              {TOP_CREATIVES.map((c) => {
                const Icon = c.type === "video" ? Video : ImageIcon;
                const title = t(`creatives.items.${c.titleKey}` as Parameters<typeof t>[0]);
                return (
                  <li
                    key={c.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-2 transition-colors hover:bg-accent"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-pink-100 text-violet-600 dark:from-violet-950/40 dark:to-pink-950/40 dark:text-violet-300">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium leading-snug" title={title}>
                        {title}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{c.brand}</p>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-0.5">
                          <Eye className="size-2.5" />
                          {c.reach}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Users className="size-2.5" />
                          {c.engagement}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* AI insights */}
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50 to-pink-50 p-4 shadow-card dark:border-violet-900 dark:from-violet-950/40 dark:via-indigo-950/40 dark:to-pink-950/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("insights.heading")}</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                <Sparkles className="size-2.5" />
                AI
              </span>
            </div>
            <ul className="space-y-3 text-xs">
              <InsightItem
                icon={TrendingUp}
                title={t("insights.brandSurge.title")}
                subtitle={t("insights.brandSurge.subtitle")}
                color="emerald"
              />
              <InsightItem
                icon={Video}
                title={t("insights.shortVideo.title")}
                subtitle={t("insights.shortVideo.subtitle")}
                color="violet"
              />
              <InsightItem
                icon={Lightbulb}
                title={t("insights.discountStrategy.title")}
                subtitle={t("insights.discountStrategy.subtitle")}
                color="amber"
              />
            </ul>
            <button className={cn(brandButton({ size: "sm" }), "mt-4 w-full")}>
              {t("actions.viewAllInsights")}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  delta,
  caption,
}: {
  label: string;
  value: string;
  delta?: number;
  caption?: string;
}) {
  const t = useTranslations("pages.competitorSpy");
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {delta !== undefined && (
        <p
          className={cn(
            "mt-0.5 text-[10px] font-medium tabular-nums",
            delta >= 0 ? "text-success" : "text-destructive",
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}% {t("overview.deltaSuffix7d")}
        </p>
      )}
      {caption && <p className="mt-0.5 text-[10px] text-muted-foreground">{caption}</p>}
    </div>
  );
}

function InsightItem({
  icon: Icon,
  title,
  subtitle,
  color,
}: {
  icon: typeof TrendingUp;
  title: string;
  subtitle: string;
  color: "emerald" | "violet" | "amber";
}) {
  const colors = {
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    violet: "bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
  };
  return (
    <li className="flex items-start gap-2.5">
      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", colors[color])}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight">{title}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
    </li>
  );
}

function FilterDropdown({ label, options }: { label: string; options: string[] }) {
  const t = useTranslations("pages.competitorSpy");
  return (
    <select className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground focus:outline-none">
      <option value="">{t("filter.labelAllFormat", { label })}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {t("filter.labelValueFormat", { label, value: o })}
        </option>
      ))}
    </select>
  );
}
