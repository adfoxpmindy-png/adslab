/**
 * Shared types + fetchers for the FROST engagement-quality insight pages.
 * Server-only — pulls live Meta data with cache: "no-store".
 */
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";

export const FROST_ACCOUNT_ID = "act_1856743671701430";
export const FROST_ACCOUNT_NAME = "FROST Magical Ice Of Siam";
export const META_VERSION = "v23.0";
export const WINDOW_START = "2026-05-21";
export const WINDOW_END = "2026-05-25";

export const ALL_PREFIXES = ["SN0526", "FST0526", "FSV0526", "SNB0526"] as const;
export type ThemePrefix = (typeof ALL_PREFIXES)[number];

export const THEME_LABELS: Record<ThemePrefix, string> = {
  SN0526: "Snow — เมืองหิมะ",
  FST0526: "Festival — หนีร้อน",
  FSV0526: "Family Vacation — พาเด็กเที่ยว",
  SNB0526: "SnowBuddy",
};

export function detectTheme(campaignName: string): ThemePrefix | "OTHER" {
  for (const p of ALL_PREFIXES) {
    if (campaignName.startsWith(p)) return p;
  }
  return "OTHER";
}

export function normalizeThemeSlug(slug: string): ThemePrefix | null {
  const upper = slug.toUpperCase();
  return (ALL_PREFIXES as readonly string[]).includes(upper) ? (upper as ThemePrefix) : null;
}

export type CampaignSummary = {
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
  reactions: number;
  comments: number;
  shares: number;
  videoViews: number;
  linkClicks: number;
  photoViews: number;
  /** comments + shares per ฿1,000 spend */
  highIntentScore: number;
};

type RawInsight = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

const num = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = (a: RawInsight["actions"], type: string) =>
  (a ?? []).filter((x) => x.action_type === type).reduce((s, x) => s + num(x.value), 0);

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { cache: "no-store" });
    const body = (await res.json()) as { data?: T[]; paging?: { next?: string }; error?: { message: string } };
    if (body.error) break;
    out.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return out;
}

export async function getFrostToken(tenantId: string): Promise<string | null> {
  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") return null;
  return decrypt(conn.accessTokenEncrypted);
}

export async function fetchAllFrostCampaigns(token: string): Promise<CampaignSummary[]> {
  const url =
    `https://graph.facebook.com/${META_VERSION}/${FROST_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: WINDOW_START, until: WINDOW_END }),
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      limit: "500",
      access_token: token,
    }).toString();

  const rows = await fetchAllPages<RawInsight>(url);
  return rows
    .map<CampaignSummary>((r) => {
      const name = r.campaign_name ?? "?";
      const channel: "FB" | "IG" = name.includes("[IG]") ? "IG" : "FB";
      const theme = detectTheme(name);
      const spend = num(r.spend);
      const eng = sum(r.actions, "post_engagement");
      const comments = sum(r.actions, "comment");
      const shares = sum(r.actions, "post");
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
        highIntentScore: spend > 0 ? ((comments + shares) / spend) * 1000 : 0,
      };
    })
    .filter((c) => c.spend > 0 && c.engagement > 0);
}

export async function fetchCreativeIdMap(
  token: string,
  campaignIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (campaignIds.length === 0) return out;
  const set = new Set(campaignIds);
  let url: string | null =
    `https://graph.facebook.com/${META_VERSION}/${FROST_ACCOUNT_ID}/ads?` +
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

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------
export const fmtNum = (n: number) => new Intl.NumberFormat("th-TH").format(n);
export const fmtThb = (n: number, d = 0) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
export const fmtCpe = (n: number) =>
  n <= 0
    ? "—"
    : new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(n);
