/**
 * Engagement Quality vs CPE — standalone insight page.
 *
 * Purpose: explain to operators that a "cheap CPE" campaign isn't automatically
 * the winner. Engagement is a bucket that mixes high-intent actions (comment,
 * share) with low-intent ones (video_view, photo_view). A campaign with low
 * CPE driven by video_views may have ZERO comments/shares — that's passive.
 *
 * Built around the real FSV0526 (Family Vacation) theme from FROST Magical Ice
 * Of Siam because it's the cleanest example we have: the campaign with
 * cheapest CPE (เมืองขนมหวาน) is video-driven, the campaign with most
 * reactions (วันหยุดนี้) has expensive CPE but more "human" engagement.
 */
import Link from "next/link";
import {
  ChevronLeft,
  Award,
  BarChart3,
  CheckCircle2,
  Heart,
  MessageCircle,
  Ruler,
  Share2,
  Target,
  Tv,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import { requireTenantMember } from "@/lib/auth/tenant";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";
import { cn } from "@/lib/utils";
import { getCreativePreview, type CreativePreview } from "@/lib/meta/creative-preview";

const FROST = "act_1856743671701430";
const V = "v23.0";
const ALL_PREFIXES = ["SN0526", "FST0526", "FSV0526", "SNB0526"] as const;
type ThemePrefix = (typeof ALL_PREFIXES)[number];

function detectTheme(campaignName: string): ThemePrefix | "OTHER" {
  for (const p of ALL_PREFIXES) {
    if (campaignName.startsWith(p)) return p;
  }
  return "OTHER";
}

type RawInsight = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

type CampaignSummary = {
  campaignId: string;
  campaignName: string;
  channel: "FB" | "IG";
  shortName: string;
  theme: ThemePrefix | "OTHER";
  spend: number;
  impressions: number;
  clicks: number;
  engagement: number;
  cpe: number;
  // Breakdown
  reactions: number;
  comments: number;
  shares: number;
  videoViews: number;
  linkClicks: number;
  photoViews: number;
  // Computed quality
  highIntentScore: number; // comments + shares (per ฿1,000 spend)
};

const num = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = (a: RawInsight["actions"], type: string) =>
  (a ?? []).filter((x) => x.action_type === type).reduce((s, x) => s + num(x.value), 0);

async function fetchAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const r = await fetch(next, { cache: "no-store" });
    const j = (await r.json()) as { data?: T[]; paging?: { next?: string }; error?: { message: string } };
    if (j.error) break;
    out.push(...(j.data ?? []));
    next = j.paging?.next ?? null;
  }
  return out;
}

async function fetchAllFrostCampaigns(token: string): Promise<CampaignSummary[]> {
  const url =
    `https://graph.facebook.com/${V}/${FROST}/insights?` +
    new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: "2026-05-21", until: "2026-05-25" }),
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      limit: "500",
      access_token: token,
    }).toString();
  const rows = await fetchAll<RawInsight>(url);
  return rows
    .map<CampaignSummary>((r) => {
      const name = r.campaign_name ?? "?";
      const channel: "FB" | "IG" = name.includes("[IG]") ? "IG" : "FB";
      const theme = detectTheme(name);
      const spend = num(r.spend);
      const eng = sum(r.actions, "post_engagement");
      const comments = sum(r.actions, "comment");
      const shares = sum(r.actions, "post");
      const highIntent = spend > 0 ? ((comments + shares) / spend) * 1000 : 0;
      const prefixToStrip = theme !== "OTHER" ? theme : "";
      return {
        campaignId: r.campaign_id ?? "?",
        campaignName: name,
        channel,
        theme,
        shortName: name
          .replace(prefixToStrip, "")
          .replace(/^\s*-?\s*\[(FB|IG)\]\s*-?\s*/, "")
          .replace(/\s*-\s*Engagement.*$/, "")
          .replace(/\s*\|.*$/, "")
          .trim()
          .slice(0, 60),
        spend,
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        engagement: eng,
        cpe: eng > 0 ? spend / eng : 0,
        reactions: sum(r.actions, "post_reaction"),
        comments,
        shares,
        videoViews: sum(r.actions, "video_view"),
        linkClicks: sum(r.actions, "link_click"),
        photoViews: sum(r.actions, "photo_view"),
        highIntentScore: highIntent,
      };
    })
    .filter((c) => c.spend > 0 && c.engagement > 0);
}

async function fetchCreativeIdMap(token: string, campaignIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (campaignIds.length === 0) return out;
  const set = new Set(campaignIds);
  let url: string | null =
    `https://graph.facebook.com/${V}/${FROST}/ads?` +
    new URLSearchParams({
      fields: "id,campaign_id,creative{id}",
      limit: "200",
      access_token: token,
    }).toString();
  while (url) {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json()) as {
      data?: Array<{ campaign_id?: string; creative?: { id?: string } }>;
      paging?: { next?: string };
    };
    for (const ad of body.data ?? []) {
      if (ad.campaign_id && set.has(ad.campaign_id) && ad.creative?.id && !out.has(ad.campaign_id)) {
        out.set(ad.campaign_id, ad.creative.id);
      }
    }
    url = body.paging?.next ?? null;
  }
  return out;
}

const fmtNum = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const fmtThb = (n: number, d = 0) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
const fmtCpe = (n: number) =>
  n <= 0
    ? "—"
    : new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(n);

export default async function EngagementQualityPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { tenantSlug } = await params;
  const { theme: themeParam } = await searchParams;
  const { tenant } = await requireTenantMember(tenantSlug);
  const t = await getTranslations();
  void t;

  const activeTheme: ThemePrefix | null =
    themeParam && (ALL_PREFIXES as readonly string[]).includes(themeParam)
      ? (themeParam as ThemePrefix)
      : null;

  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId: tenant.id },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">No active Meta connection for this workspace.</p>
      </div>
    );
  }
  const token = decrypt(conn.accessTokenEncrypted);

  const allCampaigns = await fetchAllFrostCampaigns(token);
  const campaigns = activeTheme
    ? allCampaigns.filter((c) => c.theme === activeTheme)
    : allCampaigns;
  const creativeIdMap = await fetchCreativeIdMap(
    token,
    campaigns.map((c) => c.campaignId),
  );
  const previewResults = await Promise.allSettled(
    campaigns.map(async (c) => {
      const credId = creativeIdMap.get(c.campaignId);
      if (!credId) return [c.campaignId, null as CreativePreview | null] as const;
      return [c.campaignId, await getCreativePreview(credId, tenant.id)] as const;
    }),
  );
  const previewMap = new Map<string, CreativePreview | null>();
  for (const r of previewResults) {
    if (r.status === "fulfilled") previewMap.set(r.value[0], r.value[1]);
  }

  const byCpeAsc = [...campaigns].sort((a, b) => a.cpe - b.cpe);
  const byQualityDesc = [...campaigns].sort((a, b) => b.highIntentScore - a.highIntentScore);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-8">
      <Link
        href={`/t/${tenantSlug}/insights/reports`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ChevronLeft className="size-4" />
        กลับไปหน้า Reports
      </Link>

      {/* Hero */}
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Insight · ทฤษฎีกับการอ่านผลโฆษณา
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          CPE ถูก ≠ Campaign ดี
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          เรามักดู Cost per Engagement (CPE) แล้วตัดสินว่า campaign ไหนเป็น &ldquo;winner&rdquo;
          แต่ engagement count ที่ Meta คืนมา รวมตั้งแต่ &ldquo;คนกดไลค์จริงจัง&rdquo;
          ถึง &ldquo;คนเลื่อนผ่านวิดีโอ 3 วินาที&rdquo; ไว้ในตัวเลขเดียว — ทำให้ campaign ที่ CPE ถูกกว่า
          อาจมี <strong>quality</strong> ของ engagement <strong>แย่กว่า</strong>
        </p>
      </header>

      {/* Theme filter chips */}
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Theme:</span>
        <FilterChip
          href={`/t/${tenantSlug}/insights/engagement-quality`}
          label={`All (${allCampaigns.length})`}
          active={!activeTheme}
        />
        {ALL_PREFIXES.map((p) => {
          const count = allCampaigns.filter((c) => c.theme === p).length;
          return (
            <FilterChip
              key={p}
              href={`/t/${tenantSlug}/insights/engagement-quality?theme=${p}`}
              label={`${p} (${count})`}
              active={activeTheme === p}
              disabled={count === 0}
            />
          );
        })}
      </nav>

      {/* Concept */}
      <Card className="bg-muted/30 p-5">
        <CardContent className="space-y-3 px-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Ruler className="size-5" /> Engagement quality scale
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <QualityTier
              level="HIGH"
              tone="good"
              title="Comments + Shares"
              examples={["คนพิมพ์ comment ถาม / ตอบ", "Share ไปหน้าเพจตัวเอง / กลุ่ม"]}
              note="คนใช้เวลา + เปิดเผยตัวตน = intent สูง"
            />
            <QualityTier
              level="MEDIUM"
              tone="neutral"
              title="Reactions (likes + reactions)"
              examples={["กดไลค์ภาพ", "กด Heart บน Reel"]}
              note="คนใช้เวลา 1 วินาที — ความสนใจระดับกลาง"
            />
            <QualityTier
              level="LOW"
              tone="bad"
              title="Video views + Link clicks"
              examples={["เลื่อนผ่านดูวิดีโอ 3 วิ", "Auto-play แล้วไม่ unmute"]}
              note="Meta บังคับนับ แม้คน scroll ผ่าน — passive"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            * Meta นับทุกอย่างนี้รวมใน <code className="rounded bg-muted px-1">post_engagement</code> ตัวเดียว
            ทำให้ CPE ที่ดูปกติ อาจจะ &ldquo;ดู&rdquo; จากคนที่ไม่ตั้งใจ
          </p>
        </CardContent>
      </Card>

      {/* Side-by-side ranking */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">ถ้าตัดสินด้วย CPE</p>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Award className="size-5 text-amber-500" /> ดูเหมือนเป็น winner
            </h3>
            <p className="text-sm text-muted-foreground">{byCpeAsc[0]?.shortName}</p>
            <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {fmtCpe(byCpeAsc[0]?.cpe ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              CPE ต่ำสุด · spend {fmtThb(byCpeAsc[0]?.spend ?? 0)} · {fmtNum(byCpeAsc[0]?.engagement ?? 0)} engagement
            </p>
          </div>
        </Card>
        <Card className="p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              ถ้าตัดสินด้วย Quality (comments + shares per ฿1,000)
            </p>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Award className="size-5 text-emerald-500" /> จริงๆ มี active engagement สูงสุด
            </h3>
            <p className="text-sm text-muted-foreground">{byQualityDesc[0]?.shortName}</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {(byQualityDesc[0]?.highIntentScore ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              high-intent / ฿1,000 spend · {byQualityDesc[0]?.comments ?? 0} comments ·{" "}
              {byQualityDesc[0]?.shares ?? 0} shares · CPE {fmtCpe(byQualityDesc[0]?.cpe ?? 0)}
            </p>
          </div>
        </Card>
      </section>

      {/* Per-campaign breakdown */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <BarChart3 className="size-5" /> ทุก {campaigns.length} campaign — Engagement breakdown
        </h2>
        <p className="text-sm text-muted-foreground">
          เทียบ Reactions / Comments / Shares / Video views ต่อ campaign — เห็นเลยว่าตัวไหนเก่งอะไร
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...campaigns]
            .sort((a, b) => a.cpe - b.cpe)
            .map((c) => {
              const preview = previewMap.get(c.campaignId) ?? null;
              const verdict = makeVerdict(c);
              return (
                <Card key={c.campaignId} className="overflow-hidden">
                  <div className="relative">
                    <PreviewBox preview={preview} alt={c.shortName} />
                    <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                      {c.channel}
                    </span>
                  </div>
                  <CardContent className="space-y-3 px-4 pt-3 pb-4">
                    <div className="line-clamp-2 text-sm font-medium">{c.shortName}</div>

                    {/* CPE + spend headline */}
                    <div className="flex items-baseline gap-3">
                      <span className="text-xs text-muted-foreground">CPE</span>
                      <span className="text-lg font-semibold tabular-nums">{fmtCpe(c.cpe)}</span>
                      <span className="text-xs text-muted-foreground">· spend {fmtThb(c.spend)}</span>
                    </div>

                    {/* Engagement bar breakdown */}
                    <div className="space-y-1.5">
                      <BreakdownBar
                        icon={<Heart className="size-3.5" />}
                        label="Reactions"
                        value={c.reactions}
                        max={Math.max(c.reactions, c.comments, c.shares, c.videoViews, 1)}
                        tone="neutral"
                      />
                      <BreakdownBar
                        icon={<MessageCircle className="size-3.5" />}
                        label="Comments"
                        value={c.comments}
                        max={Math.max(c.reactions, c.comments, c.shares, c.videoViews, 1)}
                        tone="good"
                      />
                      <BreakdownBar
                        icon={<Share2 className="size-3.5" />}
                        label="Shares"
                        value={c.shares}
                        max={Math.max(c.reactions, c.comments, c.shares, c.videoViews, 1)}
                        tone="good"
                      />
                      <BreakdownBar
                        icon={<Tv className="size-3.5" />}
                        label="Video views"
                        value={c.videoViews}
                        max={Math.max(c.reactions, c.comments, c.shares, c.videoViews, 1)}
                        tone="bad"
                      />
                    </div>

                    {/* Strength + next step */}
                    <div className="space-y-2">
                      <div
                        className={cn(
                          "rounded-md border px-3 py-2 text-xs",
                          verdict.tone === "good"
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-border bg-muted/30",
                        )}
                      >
                        <p className="flex items-baseline gap-1.5 font-medium text-foreground">
                          <CheckCircle2
                            className={cn(
                              "size-3.5 shrink-0 translate-y-0.5",
                              verdict.tone === "good"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground",
                            )}
                          />
                          <span>{verdict.strength}</span>
                        </p>
                      </div>
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                        <p className="flex items-baseline gap-1.5 font-medium text-foreground">
                          <Target className="size-3.5 shrink-0 translate-y-0.5 text-amber-600 dark:text-amber-400" />
                          <span>
                            <span className="text-amber-700 dark:text-amber-300">Next step:</span>{" "}
                            {verdict.nextStep}
                          </span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      {/* Action plan */}
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
        <CardContent className="space-y-4 px-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Target className="size-5" /> Action plan — ทำได้เลยใน 3 วันนี้
            {activeTheme && <span className="text-sm font-normal text-muted-foreground">· {activeTheme}</span>}
          </h2>

          <ActionPlanGrid campaigns={campaigns} />

          <div className="rounded-md bg-background/60 p-3 text-sm">
            <p className="font-medium text-foreground">สรุปแบบ 1 ประโยค</p>
            <p className="mt-1 text-muted-foreground">{generateSummary(campaigns, activeTheme)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
  disabled,
}: {
  href: string;
  label: string;
  active: boolean;
  disabled?: boolean;
}) {
  const base = "rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  if (disabled) {
    return (
      <span className={cn(base, "border-border bg-muted/30 text-muted-foreground/50")}>{label}</span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        base,
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {label}
    </Link>
  );
}

function ActionStep({ when, title, detail }: { when: string; title: string; detail: string }) {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{when}</p>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ActionPlanGrid({ campaigns }: { campaigns: CampaignSummary[] }) {
  // Derive concrete actions from real data — pick best video for scale,
  // best like-magnet for caption tweak, anything expensive for variant brief.
  const sorted = [...campaigns].sort((a, b) => a.cpe - b.cpe);
  const scaleTarget = sorted.find((c) => c.videoViews > c.reactions * 5) ?? sorted[0];
  const captionTarget = sorted.find((c) => c.reactions > 500 && c.comments < 10) ??
    sorted[Math.floor(sorted.length / 2)];
  const briefTarget = [...campaigns].sort((a, b) => b.cpe - a.cpe).find((c) => c.cpe > 0.5) ??
    sorted[sorted.length - 1];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <ActionStep
        when="วันนี้ (10 นาที)"
        title="Scale ตัวที่ CPE ต่ำสุด"
        detail={`bump งบ ${scaleTarget?.shortName ?? "winner"} (${scaleTarget?.channel}) +20% — CPE ${fmtCpe(scaleTarget?.cpe ?? 0)} ยังไม่ saturate`}
      />
      <ActionStep
        when="พรุ่งนี้เช้า (30 นาที)"
        title="ปรับ caption ตัว like-magnet"
        detail={`เพิ่มคำถามท้ายโพส ${captionTarget?.shortName ?? "ตัวที่ reactions เยอะแต่ comments น้อย"} — เพื่อ unlock comments`}
      />
      <ActionStep
        when="ภายในสัปดาห์ (1-2 ชม.)"
        title="Brief creative variant ใหม่"
        detail={`ทำ Reels vertical 3 variant แทน ${briefTarget?.shortName ?? "ตัวที่ CPE แพง"} (${briefTarget?.channel}) — ทดสอบ hook ใหม่`}
      />
    </div>
  );
}

function generateSummary(campaigns: CampaignSummary[], theme: ThemePrefix | null): string {
  if (campaigns.length === 0) return "ยังไม่มีข้อมูลพอ — รออีก 24-48 ชม.";
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalEng = campaigns.reduce((s, c) => s + c.engagement, 0);
  const totalActive = campaigns.reduce((s, c) => s + c.comments + c.shares, 0);
  const avgCpe = totalEng > 0 ? totalSpend / totalEng : 0;
  const themeLabel = theme ? `Theme ${theme}` : "FROST account นี้";
  const cheap = avgCpe < 0.2;
  const activeStrength = totalActive >= 50;

  if (cheap && activeStrength) {
    return `${themeLabel} ทำได้ดีทั้งสองด้าน — CPE เฉลี่ย ${fmtCpe(avgCpe)} + active engagement ${fmtNum(totalActive)} เป็นจุดเริ่มที่แข็งแรง · scale ต่อได้เลย`;
  }
  if (cheap) {
    return `${themeLabel} <strong>เก่งด้าน reach</strong> (CPE เฉลี่ย ${fmtCpe(avgCpe)}) — ดึง awareness ได้ดี · step ถัดไป test creative ที่กระตุ้น conversation`;
  }
  if (activeStrength) {
    return `${themeLabel} ได้ active engagement ${fmtNum(totalActive)} ครั้ง — creative ดึงคนได้ · ปรับ targeting เพื่อลด CPE จาก ${fmtCpe(avgCpe)} ลง`;
  }
  return `${themeLabel} กำลังหา audience ที่ใช่ — ให้เวลาเรียนรู้อีก 48 ชม. ถ้า CPE ยังเท่าเดิม → swap creative ใหม่`;
}

type Verdict = {
  tone: "good" | "neutral";
  strength: string; // what the campaign is good at (positive framing)
  nextStep: string; // concrete action to take (actionable)
};

function makeVerdict(c: CampaignSummary): Verdict {
  const videoDominant = c.videoViews > c.reactions * 10 && c.videoViews > 1000;
  const reactionDominant = c.reactions > 500 && c.videoViews < 100;
  const balanced = c.comments + c.shares >= 20;

  if (videoDominant) {
    return {
      tone: "good",
      strength: `Reach engine — ${fmtNum(c.videoViews)} วิดีโอวิว ทำให้ CPE ต่ำ (${fmtCpe(c.cpe)})`,
      nextStep: `Scale +20% สำหรับ awareness · ถ้าอยากได้ engagement ลึก เพิ่มแคปชั่นจบด้วยคำถาม`,
    };
  }
  if (reactionDominant) {
    return {
      tone: "good",
      strength: `Like magnet — ภาพดึงได้ ${fmtNum(c.reactions)} reactions`,
      nextStep: `Test variant แคปชั่นใหม่ที่ใส่คำถาม เพื่อ unlock comments · ทำ retargeting ไปยังคนที่กดไลค์`,
    };
  }
  if (balanced) {
    return {
      tone: "good",
      strength: `Balanced — มีทั้ง reactions, comments, shares`,
      nextStep: `เก็บเป็น control · clone เพื่อ test budget tier ที่สูงขึ้น`,
    };
  }
  // Default: small / mixed signal
  return {
    tone: "neutral",
    strength: `Mixed signal — กำลังหา audience ที่ใช่`,
    nextStep: `ให้ 48 ชม.อีก ถ้า CPE ยังเท่าเดิม → swap creative ใหม่`,
  };
}

function QualityTier({
  level,
  title,
  examples,
  note,
  tone,
}: {
  level: string;
  title: string;
  examples: string[];
  note: string;
  tone: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "bad"
        ? "border-rose-500/30 bg-rose-500/5"
        : "border-border bg-background";
  return (
    <div className={cn("space-y-2 rounded-md border p-3", toneClass)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{level}</div>
      <div className="font-medium">{title}</div>
      <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
        {examples.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function BreakdownBar({
  label,
  value,
  max,
  tone,
  icon,
}: {
  label: string;
  value: number;
  max: number;
  tone: "good" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const fillClass =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "bad"
        ? "bg-rose-500"
        : "bg-foreground/60";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-medium tabular-nums">{fmtNum(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div className={cn("h-full transition-all", fillClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PreviewBox({ preview, alt }: { preview: CreativePreview | null; alt: string }) {
  const url = preview?.imageUrl ?? preview?.videoThumbUrl ?? null;
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        No preview
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className="aspect-video w-full object-cover" />;
}
