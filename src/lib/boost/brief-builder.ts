/**
 * Combine the parser's `BoostIntent` + the URL resolver's resolved
 * posts → a list of `BoostBrief` objects ready to feed into
 * `createCampaignTree()`. One brief per URL.
 *
 * The brief is intentionally a thin wrapper over `CreateInput` so the
 * confirmation UI can edit fields directly before execution without
 * needing a separate "edit" schema.
 */
import type { BoostIntent } from "@/lib/ai/boost-parser";
import type { ResolvedFbUrl } from "@/lib/meta/url-resolver";
import type { CreateInput, MetaObjective } from "@/lib/meta/campaign-create";

export type BoostBrief = {
  /** Stable id for keying React lists + tracking execute results */
  briefId: string;
  /** Always pulled from resolved URL */
  resolved: ResolvedFbUrl;
  /** Default ad account picked — user can override in UI */
  metaAccountId: string;
  accountName: string;
  /** Auto-generated campaign name — user can edit */
  campaignName: string;
  /** Mapped from intent.objectiveHint */
  objective: MetaObjective;
  optimizationGoal: string;
  billingEvent: string;
  /** Always lifetime for boost flows (predictable spend cap) */
  lifetimeBudgetThb: number;
  startTime: Date;
  endTime: Date;
  /** From intent — surfaced to user for confirmation */
  kpi: BoostIntent["kpi"];
  purpose: string | null;
  /** Warnings/assumptions per brief that the UI must show */
  warnings: string[];
};

/**
 * Map intent → Meta campaign objective. THRUPLAY (the video-views
 * optimization) only works under OUTCOME_AWARENESS in Meta v23.0 —
 * NOT under OUTCOME_ENGAGEMENT as you'd expect from the name.
 */
const OBJECTIVE_BY_HINT: Record<BoostIntent["objectiveHint"], MetaObjective> = {
  views: "OUTCOME_AWARENESS", // for THRUPLAY pairing
  engagement: "OUTCOME_ENGAGEMENT",
  clicks: "OUTCOME_TRAFFIC",
  conversions: "OUTCOME_SALES",
  reach: "OUTCOME_AWARENESS",
  leads: "OUTCOME_LEADS",
  unknown: "OUTCOME_AWARENESS",
};

/**
 * Pick the optimization goal that best matches the user's intent + the
 * media type. Boosting a Reel for "views" means VIDEO_VIEWS (Meta
 * doesn't bill by view directly — billing stays IMPRESSIONS — but the
 * algorithm targets video-viewing users).
 */
function pickOptimizationGoal(args: {
  hint: BoostIntent["objectiveHint"];
  mediaType: ResolvedFbUrl["mediaType"];
}): { optimizationGoal: string; billingEvent: string } {
  const { hint, mediaType } = args;
  if (hint === "views" && (mediaType === "reel" || mediaType === "video")) {
    return { optimizationGoal: "THRUPLAY", billingEvent: "IMPRESSIONS" };
  }
  if (hint === "engagement") {
    return { optimizationGoal: "POST_ENGAGEMENT", billingEvent: "IMPRESSIONS" };
  }
  if (hint === "clicks") {
    return { optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS" };
  }
  if (hint === "reach") {
    return { optimizationGoal: "REACH", billingEvent: "IMPRESSIONS" };
  }
  if (hint === "leads") {
    return { optimizationGoal: "LEAD_GENERATION", billingEvent: "IMPRESSIONS" };
  }
  if (hint === "conversions") {
    return { optimizationGoal: "OFFSITE_CONVERSIONS", billingEvent: "IMPRESSIONS" };
  }
  // unknown — match media type if possible
  if (mediaType === "reel" || mediaType === "video") {
    return { optimizationGoal: "THRUPLAY", billingEvent: "IMPRESSIONS" };
  }
  return { optimizationGoal: "POST_ENGAGEMENT", billingEvent: "IMPRESSIONS" };
}

/**
 * Calculate the effective per-brief budget given the intent's mode.
 * "per_post" → each brief gets `budgetThb`
 * "total"    → each brief gets `budgetThb / N`
 */
function perBriefBudget(intent: BoostIntent, briefCount: number): number {
  if (intent.budgetMode === "per_post") return intent.budgetThb;
  return Math.floor(intent.budgetThb / Math.max(1, briefCount));
}

/**
 * Default schedule: start = now + 5 min (safety buffer), end = parsed
 * end or +24h from start if no end was specified.
 */
function defaultSchedule(intent: BoostIntent): { start: Date; end: Date } {
  const now = new Date();
  const start = intent.scheduleStartIso
    ? new Date(intent.scheduleStartIso)
    : new Date(now.getTime() + 5 * 60_000);
  const end = intent.scheduleEndIso
    ? new Date(intent.scheduleEndIso)
    : new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

/**
 * Generate a campaign name. Keep it short — Meta's display limit is 100
 * but readable in UI is much less.
 *   "AdsLab Boost · 2026-05-14 · EV Plaza · 1015360974392298"
 */
function makeCampaignName(args: {
  resolved: ResolvedFbUrl;
  endTime: Date;
}): string {
  const date = args.endTime.toISOString().slice(0, 10);
  const pagePart = args.resolved.pageName.slice(0, 24);
  const postPart = args.resolved.postId.split("_").pop()?.slice(0, 16) ?? "post";
  return `AdsLab Boost · ${date} · ${pagePart} · ${postPart}`;
}

export function buildBriefs(args: {
  intent: BoostIntent;
  resolvedUrls: ResolvedFbUrl[];
  /** Mapped account-per-page. If a pageId has no entry, brief gets a warning. */
  accountByPageId: Map<string, { metaAccountId: string; name: string }>;
}): BoostBrief[] {
  const { intent, resolvedUrls, accountByPageId } = args;
  const { start, end } = defaultSchedule(intent);
  const budget = perBriefBudget(intent, resolvedUrls.length);

  return resolvedUrls.map((r, idx) => {
    const acct = accountByPageId.get(r.pageId);
    const { optimizationGoal, billingEvent } = pickOptimizationGoal({
      hint: intent.objectiveHint,
      mediaType: r.mediaType,
    });
    const warnings: string[] = [];
    if (!acct) {
      warnings.push(
        `Page "${r.pageName}" (${r.pageId}) ยังไม่มี ad account ที่เชื่อมไว้ — เลือกเองได้ในการ์ดนี้`,
      );
    }
    if (intent.scheduleEndIso === null) {
      warnings.push("ไม่ได้ระบุเวลาสิ้นสุด — ตั้งให้ +24 ชม จากตอนเริ่ม");
    }
    if (intent.objectiveHint === "unknown") {
      warnings.push("ไม่ได้ระบุ objective — ใช้ Engagement เป็นค่า default");
    }
    return {
      briefId: `brief_${idx}_${r.postId}`,
      resolved: r,
      metaAccountId: acct?.metaAccountId ?? "",
      accountName: acct?.name ?? "",
      campaignName: makeCampaignName({ resolved: r, endTime: end }),
      objective: OBJECTIVE_BY_HINT[intent.objectiveHint],
      optimizationGoal,
      billingEvent,
      lifetimeBudgetThb: budget,
      startTime: start,
      endTime: end,
      kpi: intent.kpi,
      purpose: intent.purpose,
      warnings,
    };
  });
}

/**
 * Turn a BoostBrief into the exact `CreateInput` shape expected by
 * `createCampaignTree()`. Boost flow is always:
 *   - CBO + lifetime budget on campaign
 *   - existing_post creative
 *   - PAUSED unless caller overrides
 */
export function briefToCreateInput(args: {
  brief: BoostBrief;
  tenantId: string;
  userId: string;
  initialStatus: "PAUSED" | "ACTIVE";
}): CreateInput {
  const { brief, tenantId, userId, initialStatus } = args;
  return {
    tenantId,
    userId,
    metaAccountId: brief.metaAccountId,
    campaignName: brief.campaignName,
    objective: brief.objective,
    specialAdCategories: ["NONE"],
    budgetMode: "CBO",
    campaignLifetimeBudget: brief.lifetimeBudgetThb,
    adSetName: `${brief.campaignName} — Ad Set`,
    targeting: {
      // Minimum viable targeting for a boost — Meta needs SOMETHING here
      // or it rejects. "Thailand only" is a safe default since 99% of
      // boosts target the page's local audience. age_min=20 is the
      // minimum Meta allows for Thailand-targeted ads as of 2025.
      geo_locations: { countries: ["TH"] },
      age_min: 20,
      age_max: 65,
    },
    optimizationGoal: brief.optimizationGoal,
    billingEvent: brief.billingEvent,
    startTime: brief.startTime,
    endTime: brief.endTime,
    adName: `${brief.campaignName} — Ad`,
    pageId: brief.resolved.pageId,
    initialStatus,
    creative:
      brief.resolved.mediaType === "reel"
        ? {
            // Reels are video objects, not page posts — use the bare
            // video id (without page prefix) via video_data shape.
            kind: "video_reel",
            videoId: brief.resolved.postId.includes("_")
              ? brief.resolved.postId.split("_").pop()!
              : brief.resolved.postId,
          }
        : { kind: "existing_post", postId: brief.resolved.postId },
  };
}
