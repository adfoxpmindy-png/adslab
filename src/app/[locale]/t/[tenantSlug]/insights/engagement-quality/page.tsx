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
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Heart,
  MessageCircle,
  Ruler,
  Share2,
  Target,
  Tv,
  Wand2,
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
const PREFIX = "FSV0526";

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

async function fetchFsvCampaigns(token: string): Promise<CampaignSummary[]> {
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
    .filter((r) => (r.campaign_name ?? "").startsWith(PREFIX))
    .map<CampaignSummary>((r) => {
      const name = r.campaign_name ?? "?";
      const channel: "FB" | "IG" = name.includes("[IG]") ? "IG" : "FB";
      const spend = num(r.spend);
      const eng = sum(r.actions, "post_engagement");
      const comments = sum(r.actions, "comment");
      const shares = sum(r.actions, "post");
      const highIntent = spend > 0 ? ((comments + shares) / spend) * 1000 : 0;
      return {
        campaignId: r.campaign_id ?? "?",
        campaignName: name,
        channel,
        shortName: name
          .replace(PREFIX, "")
          .replace(/^\s*-?\s*\[(FB|IG)\]\s*-?\s*/, "")
          .replace(/\s*-\s*Engagement.*$/, "")
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
    });
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
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const { tenant } = await requireTenantMember(tenantSlug);
  const t = await getTranslations();
  void t; // i18n hookup point for later — strings inline for now (single-purpose page)

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

  const campaigns = await fetchFsvCampaigns(token);
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
          <BarChart3 className="size-5" /> ทุก campaign — Engagement breakdown
        </h2>
        <p className="text-sm text-muted-foreground">
          เทียบ Reactions / Comments / Shares / Video views ต่อ campaign — เห็นเลยว่า &ldquo;ใครได้ engagement จากอะไร&rdquo;
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                    {/* Verdict */}
                    <div
                      className={cn(
                        "rounded-md border px-3 py-2 text-xs",
                        verdict.tone === "good" && "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
                        verdict.tone === "bad" && "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
                        verdict.tone === "neutral" && "border-border bg-muted/30 text-foreground",
                      )}
                    >
                      <p className="flex items-center gap-1.5 font-medium">
                        {verdict.tone === "good" && <CheckCircle2 className="size-3.5" />}
                        {verdict.tone === "bad" && <AlertTriangle className="size-3.5" />}
                        {verdict.tone === "neutral" && <Tv className="size-3.5" />}
                        {verdict.headline}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">{verdict.detail}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      {/* Takeaway */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-5">
        <CardContent className="space-y-3 px-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Target className="size-5" /> Takeaway สำหรับ FROST FSV0526
          </h2>
          <ul className="ml-5 list-disc space-y-2 text-sm">
            <li>
              <strong>&ldquo;เมืองขนมหวาน&rdquo; (FB/IG)</strong> มี CPE ถูกที่สุด — แต่ engagement{" "}
              <strong>~98% มาจาก video views</strong> (auto-play scroll-throughs) · มี comment แค่ 1, share &lt; 75
              → ใช้สำหรับ <strong>brand awareness / reach</strong> ได้ ไม่ใช่ active engagement
            </li>
            <li>
              <strong>&ldquo;วันหยุดนี้&rdquo; (FB/IG)</strong> มี Reactions เยอะ (992-1,246) แต่ <strong>0-2 comments, 5-7
              shares</strong> เท่านั้น · CPE แพง 13-22 เท่า · creative ดึงไลค์ผ่านๆ
              แต่ไม่กระตุ้นความคิด / action จริง
            </li>
            <li>
              <strong>0 campaign มี comments หรือ shares เป็นเลข 2 หลัก</strong> → theme ทั้ง FSV0526
              ขาด &ldquo;ปลุก conversation&rdquo; — ถ้าจะใช้ creative line นี้ต่อ ต้องเปลี่ยน hook เป็น question /
              opinion bait
            </li>
            <li>
              <strong>ห้าม scale แค่เพราะ CPE ถูก</strong> — ดู comments + shares ก่อนตัดสินใจว่า
              &ldquo;winner จริง&rdquo; หรือเพียง &ldquo;passive view ราคาถูก&rdquo;
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function makeVerdict(c: CampaignSummary): {
  tone: "good" | "bad" | "neutral";
  headline: string;
  detail: string;
} {
  const totalActive = c.comments + c.shares;
  const videoDominant = c.videoViews > c.reactions * 10;
  const reactionDominant = c.reactions > 500 && c.videoViews === 0;
  const noActive = totalActive < 20;

  if (videoDominant) {
    return {
      tone: "neutral",
      headline: "Video-driven (passive)",
      detail: `${fmtNum(c.videoViews)} video views ดัน CPE ลง — แต่ ${c.comments} comments · ${c.shares} shares เท่านั้น`,
    };
  }
  if (reactionDominant) {
    return {
      tone: "bad",
      headline: "Like-only (no conversation)",
      detail: `${fmtNum(c.reactions)} ไลค์ แต่ ${c.comments} comments · ${c.shares} shares = passive engagement`,
    };
  }
  if (noActive) {
    return {
      tone: "bad",
      headline: "Active engagement ต่ำมาก",
      detail: `รวม comments + shares = ${totalActive} ใน spend ${fmtThb(c.spend)} = ขาด conversation signal`,
    };
  }
  return {
    tone: "good",
    headline: "Balanced engagement",
    detail: `Active = ${totalActive} · Reactions = ${fmtNum(c.reactions)}`,
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
