import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import {
  ALL_PREFIXES,
  THEME_LABELS,
  fetchAllFrostCampaigns,
  fetchCreativeIdMap,
  fmtCpe,
  fmtNum,
  fmtThb,
  getFrostToken,
  normalizeThemeSlug,
  type CampaignSummary,
  type ThemePrefix,
} from "@/lib/frost-engagement";
import { getCreativePreview, type CreativePreview } from "@/lib/meta/creative-preview";
import { CampaignEngagementCard } from "@/components/reports/campaign-engagement-card";
import { cn } from "@/lib/utils";

export default async function ThemePage({
  params,
}: {
  params: Promise<{ tenantSlug: string; theme: string }>;
}) {
  const { tenantSlug, theme: themeSlug } = await params;
  const theme = normalizeThemeSlug(themeSlug);
  if (!theme) notFound();

  const { tenant } = await requireTenantMember(tenantSlug);
  const token = await getFrostToken(tenant.id);
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">No active Meta connection for this workspace.</p>
      </div>
    );
  }

  const allCampaigns = await fetchAllFrostCampaigns(token);
  const themeCampaigns = allCampaigns.filter((c) => c.theme === theme);
  if (themeCampaigns.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-muted-foreground">
        Theme {theme} ยังไม่มี campaign ที่มี data — รออีก 24-48 ชม.
      </div>
    );
  }

  const creativeIdMap = await fetchCreativeIdMap(
    token,
    themeCampaigns.map((c) => c.campaignId),
  );
  const previewResults = await Promise.allSettled(
    themeCampaigns.map(async (c) => {
      const credId = creativeIdMap.get(c.campaignId);
      if (!credId) return [c.campaignId, null as CreativePreview | null] as const;
      return [c.campaignId, await getCreativePreview(credId, tenant.id)] as const;
    }),
  );
  const previewMap = new Map<string, CreativePreview | null>();
  for (const r of previewResults) {
    if (r.status === "fulfilled") previewMap.set(r.value[0], r.value[1]);
  }

  const fbCampaigns = themeCampaigns.filter((c) => c.channel === "FB").sort((a, b) => a.cpe - b.cpe);
  const igCampaigns = themeCampaigns.filter((c) => c.channel === "IG").sort((a, b) => a.cpe - b.cpe);

  const fbAgg = aggregate(fbCampaigns);
  const igAgg = aggregate(igCampaigns);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <Link
        href={`/t/${tenantSlug}/insights/engagement-quality`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ChevronLeft className="size-4" />
        กลับไปหน้ารวม Themes
      </Link>

      {/* Hero */}
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Theme insight · FROST Magical Ice Of Siam
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{theme}</h1>
        <p className="text-base text-muted-foreground">{THEME_LABELS[theme]}</p>
      </header>

      {/* Theme tabs (jump between themes) */}
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Switch theme:</span>
        {ALL_PREFIXES.map((p) => {
          const count = allCampaigns.filter((c) => c.theme === p).length;
          return (
            <Link
              key={p}
              href={`/t/${tenantSlug}/insights/engagement-quality/${p.toLowerCase()}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                p === theme
                  ? "border-foreground bg-foreground text-background"
                  : count === 0
                    ? "border-border bg-muted/30 text-muted-foreground/50 pointer-events-none"
                    : "border-border bg-background hover:bg-accent",
              )}
            >
              {p} ({count})
            </Link>
          );
        })}
      </nav>

      {/* Theme total + Platform comparison summary */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ThemeTotalSummary
          theme={theme}
          agg={aggregate(themeCampaigns)}
          count={themeCampaigns.length}
        />
        <PlatformSummary
          platform="FB"
          icon={<PlatformBadge platform="FB" />}
          agg={fbAgg}
          count={fbCampaigns.length}
        />
        <PlatformSummary
          platform="IG"
          icon={<PlatformBadge platform="IG" />}
          agg={igAgg}
          count={igCampaigns.length}
        />
      </section>

      <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <strong className="text-foreground">CPE blended</strong> = total spend ÷ total engagement
        ของกลุ่มนั้นๆ — ใช้แบบนี้แทน simple average เพราะ campaign ใหญ่ดันค่าจริงมากกว่า · ดูตรงกับ
        Meta Ads Manager &ldquo;Cost per Engagement&rdquo; ของ filtered view
      </p>

      {/* FB section */}
      {fbCampaigns.length > 0 && (
        <PlatformSection
          title="Facebook campaigns"
          icon={<PlatformBadge platform="FB" />}
          campaigns={fbCampaigns}
          previewMap={previewMap}
        />
      )}

      {/* IG section */}
      {igCampaigns.length > 0 && (
        <PlatformSection
          title="Instagram campaigns"
          icon={<PlatformBadge platform="IG" />}
          campaigns={igCampaigns}
          previewMap={previewMap}
        />
      )}
    </div>
  );
}

type AggSummary = {
  spend: number;
  engagement: number;
  cpe: number;
  active: number;
  reach: number;
  comments: number;
  shares: number;
};
function aggregate(campaigns: CampaignSummary[]): AggSummary {
  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const engagement = campaigns.reduce((s, c) => s + c.engagement, 0);
  const comments = campaigns.reduce((s, c) => s + c.comments, 0);
  const shares = campaigns.reduce((s, c) => s + c.shares, 0);
  return {
    spend,
    engagement,
    cpe: engagement > 0 ? spend / engagement : 0,
    active: campaigns.length,
    reach: campaigns.reduce((s, c) => s + c.impressions, 0),
    comments,
    shares,
  };
}

function PlatformSummary({
  platform,
  icon,
  agg,
  count,
}: {
  platform: "FB" | "IG";
  icon: React.ReactNode;
  agg: AggSummary;
  count: number;
}) {
  if (count === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          <span className="font-medium">{platform === "FB" ? "Facebook" : "Instagram"}</span>
          <span>· ไม่มี campaign ใน theme นี้</span>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-foreground">
            {platform === "FB" ? "Facebook" : "Instagram"}
          </span>
          <span className="text-xs text-muted-foreground">· {count} campaigns</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Spend" value={fmtThb(agg.spend)} />
          <Stat label="Engagement" value={fmtNum(agg.engagement)} />
          <Stat label="CPE blended" value={fmtCpe(agg.cpe)} />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{fmtNum(agg.comments)} comments</span>
          <span>{fmtNum(agg.shares)} shares</span>
        </div>
      </div>
    </Card>
  );
}

function ThemeTotalSummary({
  theme,
  agg,
  count,
}: {
  theme: ThemePrefix;
  agg: AggSummary;
  count: number;
}) {
  return (
    <Card className="border-foreground/30 bg-foreground/5 p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded bg-foreground text-[10px] font-bold uppercase text-background">
            All
          </span>
          <span className="font-medium text-foreground">{theme} ทั้ง theme</span>
          <span className="text-xs text-muted-foreground">· {count} campaigns</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Spend" value={fmtThb(agg.spend)} />
          <Stat label="Engagement" value={fmtNum(agg.engagement)} />
          <Stat label="CPE blended" value={fmtCpe(agg.cpe)} />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{fmtNum(agg.comments)} comments</span>
          <span>{fmtNum(agg.shares)} shares</span>
        </div>
      </div>
    </Card>
  );
}

function PlatformBadge({ platform }: { platform: "FB" | "IG" }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded text-[11px] font-bold text-white",
        platform === "FB" ? "bg-[#1877f2]" : "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]",
      )}
    >
      {platform}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function PlatformSection({
  title,
  icon,
  campaigns,
  previewMap,
}: {
  title: string;
  icon: React.ReactNode;
  campaigns: CampaignSummary[];
  previewMap: Map<string, CreativePreview | null>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        {icon}
        {title}
        <span className="text-sm font-normal text-muted-foreground">· {campaigns.length} campaigns</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {campaigns.map((c) => (
          <CampaignEngagementCard
            key={c.campaignId}
            campaign={c}
            preview={previewMap.get(c.campaignId) ?? null}
          />
        ))}
      </div>
    </section>
  );
}
