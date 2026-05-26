/**
 * Media plan baseline — source-of-truth budgets from the May 2026
 * media plan PDF ("Snowyn & Fost Media Plan.pdf"). Hard-coded because
 * the plan is a deal-side document, not a live system source.
 *
 * Brand → campaign-prefix mapping (verified from campaign names in
 * FROST Meta account act_1856743671701430):
 *   SN0526   → Snowyn Wonderland   (e.g. "SN0526 [FB] เด็กเจอหิมะ")
 *   FST0526  → FROST Magical Ice   (e.g. "FST0526 เที่ยวทะเล")
 *   FSV0526  → Fairy Sweet Village (e.g. "FSV0526 พาเที่ยวเมืองขนมหวาน")
 *   SNB0526  → SnowBuddy WinterLand (e.g. "SNB0526 SnowBuddy")
 */
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto/aes";

export const META_VERSION = "v23.0";
export const FROST_ACCOUNT_ID = "act_1856743671701430";

export type Platform = "facebook" | "instagram" | "tiktok" | "google";

export type BrandKey = "snowyn" | "frost" | "snowbuddy" | "fairySweet";

export type BrandPlan = {
  key: BrandKey;
  name: string;
  /** Campaign-name prefix used to attribute live Meta spend back to this brand. */
  campaignPrefix: string;
  monthlyBudget: number;
  platforms: Record<Platform, number>;
  brandColor: string;
};

export const MEDIA_PLAN: BrandPlan[] = [
  {
    key: "snowyn",
    name: "Snowyn Wonderland",
    campaignPrefix: "SN0526",
    monthlyBudget: 65000,
    platforms: { facebook: 25000, instagram: 5000, tiktok: 25000, google: 10000 },
    brandColor: "#3b82f6",
  },
  {
    key: "frost",
    name: "FROST Magical Ice of Siam",
    campaignPrefix: "FST0526",
    monthlyBudget: 45000,
    platforms: { facebook: 20000, instagram: 5000, tiktok: 15000, google: 5000 },
    brandColor: "#06b6d4",
  },
  {
    key: "snowbuddy",
    name: "SnowBuddy WinterLand",
    campaignPrefix: "SNB0526",
    monthlyBudget: 20000,
    platforms: { facebook: 10000, instagram: 0, tiktok: 10000, google: 0 },
    brandColor: "#a855f7",
  },
  {
    key: "fairySweet",
    name: "Fairy Sweet Village",
    campaignPrefix: "FSV0526",
    monthlyBudget: 20000,
    platforms: { facebook: 5000, instagram: 5000, tiktok: 10000, google: 0 },
    brandColor: "#ec4899",
  },
];

export const TOTAL_PLANNED_BUDGET = MEDIA_PLAN.reduce((s, b) => s + b.monthlyBudget, 0);
export const PLAN_PERIOD_LABEL = "พฤษภาคม 2026";
export const PLAN_PERIOD_START = "2026-05-01";

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google Ads",
};

/** Platforms AdsLab can pull live data for; others = "data not connected yet". */
export const PLATFORMS_TRACKED: Platform[] = ["facebook", "instagram"];

export type BrandActual = {
  brandKey: BrandKey;
  /** Spend on platforms AdsLab can measure (FB + IG via Meta API). */
  meta: { facebook: number; instagram: number };
  /** Reference number from PDF OVERVIEW table (1-20 พ.ค.), nullable. */
  pdfReportedSpend: number | null;
};

const RAW_INSIGHTS_FIELDS = "campaign_id,campaign_name,spend,publisher_platform";

type RawInsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  publisher_platform?: string; // "facebook" | "instagram" | "messenger" | "audience_network"
};

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { cache: "no-store" });
    const body = (await res.json()) as {
      data?: T[];
      paging?: { next?: string };
      error?: { message: string };
    };
    if (body.error) break;
    out.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return out;
}

/**
 * Fetch month-to-date Meta spend for the FROST ad account, broken down by
 * campaign name + publisher platform. Returns one entry per brand with FB+IG
 * spend totals attributed via campaignPrefix.
 *
 * Falls back to the hard-coded PDF report numbers if the Meta connection
 * isn't available — so the page always renders something useful.
 */
export async function fetchBrandActuals(tenantId: string): Promise<BrandActual[]> {
  // PDF-reported reference numbers (period 1-20 พ.ค.) — used as fallback only.
  const pdfReported: Partial<Record<BrandKey, number>> = {
    snowyn: 9731.56,
    frost: 3475.14,
  };

  const baseResult: BrandActual[] = MEDIA_PLAN.map((b) => ({
    brandKey: b.key,
    meta: { facebook: 0, instagram: 0 },
    pdfReportedSpend: pdfReported[b.key] ?? null,
  }));

  const conn = await prisma.metaConnection.findUnique({
    where: { tenantId },
    select: { accessTokenEncrypted: true, status: true },
  });
  if (!conn || conn.status !== "ACTIVE") return baseResult;
  const token = decrypt(conn.accessTokenEncrypted);

  const today = new Date().toISOString().slice(0, 10);
  const url =
    `https://graph.facebook.com/${META_VERSION}/${FROST_ACCOUNT_ID}/insights?` +
    new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: PLAN_PERIOD_START, until: today }),
      fields: RAW_INSIGHTS_FIELDS,
      breakdowns: "publisher_platform",
      limit: "500",
      access_token: token,
    }).toString();

  const rows = await fetchAllPages<RawInsightRow>(url);

  for (const r of rows) {
    const name = r.campaign_name ?? "";
    const spend = Number(r.spend);
    if (!Number.isFinite(spend) || spend <= 0) continue;
    const platform = r.publisher_platform;
    if (platform !== "facebook" && platform !== "instagram") continue;
    const brand = MEDIA_PLAN.find((b) => name.startsWith(b.campaignPrefix));
    if (!brand) continue;
    const bucket = baseResult.find((b) => b.brandKey === brand.key);
    if (!bucket) continue;
    bucket.meta[platform] += spend;
  }

  return baseResult;
}

export type BrandRollup = {
  plan: BrandPlan;
  /** Total Meta-tracked spend (FB + IG) MTD. */
  metaSpend: number;
  /** Spend per platform from Meta API (FB + IG only — others = null). */
  perPlatformSpend: Partial<Record<Platform, number>>;
  /** PDF reported reference number; informational only. */
  pdfReportedSpend: number | null;
  /** Sum of FB + IG budgets — the slice of the plan we can actually measure. */
  trackedBudget: number;
  /** Remaining FB + IG budget = trackedBudget - metaSpend (floored at 0). */
  trackedRemaining: number;
  /** Percent of the FULL monthly budget that's been spent on tracked platforms. */
  spentPctOfTotal: number;
  /** Percent of the TRACKED slice that's been spent. */
  spentPctOfTracked: number;
};

export function buildBrandRollups(actuals: BrandActual[]): BrandRollup[] {
  return MEDIA_PLAN.map((plan) => {
    const actual = actuals.find((a) => a.brandKey === plan.key);
    const metaSpend = actual ? actual.meta.facebook + actual.meta.instagram : 0;
    const trackedBudget = plan.platforms.facebook + plan.platforms.instagram;
    const trackedRemaining = Math.max(0, trackedBudget - metaSpend);
    return {
      plan,
      metaSpend,
      perPlatformSpend: {
        facebook: actual?.meta.facebook ?? 0,
        instagram: actual?.meta.instagram ?? 0,
      },
      pdfReportedSpend: actual?.pdfReportedSpend ?? null,
      trackedBudget,
      trackedRemaining,
      spentPctOfTotal: plan.monthlyBudget > 0 ? (metaSpend / plan.monthlyBudget) * 100 : 0,
      spentPctOfTracked: trackedBudget > 0 ? (metaSpend / trackedBudget) * 100 : 0,
    };
  });
}

export const fmtThb = (n: number, d = 0) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
