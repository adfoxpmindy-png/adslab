import { prisma } from "@/lib/prisma";
import { getFreshAccessToken } from "./client";
import { graphFetch } from "./graph-api";
import { getPageAccessToken } from "./pages";
import { invalidateDashboardCache } from "./dashboard-service";
import { thbToMinorUnits } from "./campaign-actions";

/**
 * Create a Campaign → Ad Set → Ad tree in Meta from a wizard payload,
 * then sync the new entities into our local DB.
 *
 * Important Meta API quirks handled here:
 *   - Meta's status field is "PAUSED" everywhere; we always start that way
 *   - Ad set `targeting` is a deep nested object — passed through as JSON
 *   - Creative is created via TWO paths:
 *       (a) existing post: object_story_id = "<page_id>_<post_id>"
 *       (b) new image:     object_story_spec = { page_id, link_data: {...} }
 *   - Ad references creative_id (creative is its own entity)
 *   - On mid-tree failure we DO NOT auto-rollback — Meta has already
 *     charged the user; manual cleanup is safer than silent deletion
 */

export type CreateInput = {
  tenantId: string;
  userId: string;

  // Campaign-level
  metaAccountId: string; // "act_xxx"
  campaignName: string;
  objective: MetaObjective;
  specialAdCategories: SpecialAdCategory[];
  budgetMode: "CBO" | "ABO";
  campaignDailyBudget?: number; // THB, required if CBO + daily
  campaignLifetimeBudget?: number; // THB, required if CBO + lifetime

  // Ad set
  adSetName: string;
  adSetDailyBudget?: number; // THB, required if ABO + daily
  adSetLifetimeBudget?: number; // THB, required if ABO + lifetime
  /** Meta-shaped targeting blob. Wizard builds this. */
  targeting: Record<string, unknown>;
  optimizationGoal: string; // e.g. REACH, LINK_CLICKS, OFFSITE_CONVERSIONS
  billingEvent: string; // e.g. IMPRESSIONS, LINK_CLICKS
  startTime?: Date;
  endTime?: Date;

  // Ad + creative
  adName: string;
  pageId: string;
  /**
   * Required only for pixel-based optimization goals (OFFSITE_CONVERSIONS,
   * VALUE). The pixel must already exist on the ad account.
   */
  pixelId?: string;
  /**
   * Custom event the pixel is optimizing for (PURCHASE, LEAD, etc.).
   * Required when pixelId is set and customConversionId is not.
   */
  customEventType?: string;
  /**
   * Meta Custom Conversion id. If provided, used instead of
   * customEventType — Meta optimizes for the conversion's URL rule
   * rather than a raw event type.
   */
  customConversionId?: string;
  /**
   * Status applied to Campaign + Ad Set + Ad on creation.
   * - PAUSED (default) → safe: user reviews before paying
   * - ACTIVE → goes live immediately, Meta starts charging
   */
  initialStatus?: "PAUSED" | "ACTIVE";
  creative:
    | { kind: "existing_post"; postId: string }
    | {
        kind: "video_reel";
        /** Bare video id (e.g. "994832796325634"), NOT pageId_videoId. */
        videoId: string;
        /** Optional caption. If omitted Meta uses the reel's existing caption. */
        message?: string;
      }
    | {
        kind: "new_image";
        imageHash: string;
        primaryText: string;
        headline?: string;
        description?: string;
        linkUrl: string;
        callToAction: CallToActionType;
      };
};

export type MetaObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_APP_PROMOTION";

export type SpecialAdCategory =
  | "NONE"
  | "HOUSING"
  | "EMPLOYMENT"
  | "CREDIT"
  | "ISSUES_ELECTIONS_POLITICS";

export type CallToActionType =
  | "LEARN_MORE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "DOWNLOAD"
  | "GET_OFFER"
  | "CONTACT_US"
  | "MESSAGE_PAGE"
  | "ORDER_NOW";

export type CreateResult =
  | {
      ok: true;
      campaign: { internalId: string; metaId: string; name: string };
      adSet: { internalId: string; metaId: string; name: string };
      ad: { internalId: string; metaId: string; name: string };
      logId: string;
    }
  | {
      ok: false;
      /** Where in the tree we failed. Lets the UI show partial state. */
      failedAt: "campaign" | "adset" | "creative" | "ad" | "sync";
      error: string;
      /** Any partial entities created before the failure — caller can show "manual cleanup". */
      partial: {
        campaignMetaId?: string;
        adSetMetaId?: string;
        creativeId?: string;
      };
      logId: string | null;
    };

const MIN_BUDGET_THB = 20;
const MAX_BUDGET_THB = 1_000_000;

function validateBudget(thb: number | undefined, name: string): string | null {
  if (thb === undefined) return null;
  if (!Number.isFinite(thb)) return `${name} ต้องเป็นตัวเลข`;
  if (thb < MIN_BUDGET_THB) return `${name} ต่ำกว่าขั้นต่ำ ฿${MIN_BUDGET_THB}`;
  if (thb > MAX_BUDGET_THB) return `${name} เกินเพดาน ฿${MAX_BUDGET_THB.toLocaleString()}`;
  return null;
}

export async function createCampaignTree(input: CreateInput): Promise<CreateResult> {
  // ---- 0. Pre-flight validation ----
  for (const [thb, label] of [
    [input.campaignDailyBudget, "Campaign daily budget"],
    [input.campaignLifetimeBudget, "Campaign lifetime budget"],
    [input.adSetDailyBudget, "Ad set daily budget"],
    [input.adSetLifetimeBudget, "Ad set lifetime budget"],
  ] as const) {
    const err = validateBudget(thb, label);
    if (err) return logFailureNoMeta(input, "campaign", err);
  }

  if (input.budgetMode === "CBO") {
    const has = input.campaignDailyBudget !== undefined || input.campaignLifetimeBudget !== undefined;
    if (!has) return logFailureNoMeta(input, "campaign", "CBO ต้องระบุ budget ระดับ campaign");
  } else {
    const has = input.adSetDailyBudget !== undefined || input.adSetLifetimeBudget !== undefined;
    if (!has) return logFailureNoMeta(input, "campaign", "ABO ต้องระบุ budget ระดับ ad set");
  }

  // ---- 1. Verify Meta connection + ownership of ad account ----
  const connection = await prisma.metaConnection.findUnique({
    where: { tenantId: input.tenantId },
    select: {
      id: true,
      tenantId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      metaUserId: true,
      metaUserName: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
    },
  });
  if (!connection) return logFailureNoMeta(input, "campaign", "ไม่พบ Meta connection");
  if (connection.status !== "ACTIVE")
    return logFailureNoMeta(input, "campaign", `Connection ${connection.status} — เชื่อมใหม่ก่อน`);

  const ownsAccount = await prisma.metaAdAccount.findFirst({
    where: { metaConnectionId: connection.id, metaAccountId: input.metaAccountId },
    select: { id: true },
  });
  if (!ownsAccount)
    return logFailureNoMeta(input, "campaign", "Ad account นี้ไม่อยู่ใน Meta connection ของ tenant");

  const accessToken = await getFreshAccessToken(connection);

  // ---- 2. Create Campaign ----
  const status = input.initialStatus ?? "PAUSED";
  const campaignBody: Record<string, unknown> = {
    name: input.campaignName,
    objective: input.objective,
    status,
    special_ad_categories: input.specialAdCategories.includes("NONE")
      ? []
      : input.specialAdCategories,
  };
  if (input.budgetMode === "CBO") {
    if (input.campaignDailyBudget !== undefined) {
      campaignBody.daily_budget = String(thbToMinorUnits(input.campaignDailyBudget));
    } else if (input.campaignLifetimeBudget !== undefined) {
      campaignBody.lifetime_budget = String(thbToMinorUnits(input.campaignLifetimeBudget));
    }
    // CBO REQUIRES bid_strategy at the campaign level. Without it Meta
    // defaults the ad set to a bid-cap variant that demands bid_amount.
    campaignBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }

  let campaignMetaId: string;
  try {
    const res = await graphFetch<{ id: string }>(
      `/${input.metaAccountId}/campaigns`,
      { method: "POST", accessToken, body: campaignBody },
    );
    campaignMetaId = res.id;
  } catch (err) {
    return logFailure(input, "campaign", metaErrorMsg(err), {});
  }

  // ---- 3. Create Ad Set ----
  // bid_strategy placement rules:
  //   CBO (campaign-level budget) → bid_strategy MUST be on the campaign
  //     (set above). Ad set MUST NOT include it or Meta rejects.
  //   ABO (ad-set-level budget) → bid_strategy goes on each ad set.
  //
  // promoted_object: required for optimization goals that target a
  // specific entity (page, pixel, app, lead form). Without it Meta
  // rejects with a confusing "conversion source missing" error.
  const adSetBody: Record<string, unknown> = {
    name: input.adSetName,
    campaign_id: campaignMetaId,
    status,
    targeting: input.targeting,
    optimization_goal: input.optimizationGoal,
    billing_event: input.billingEvent,
    // Meta defaults Multi-Advertiser Ads to ON since Aug 2024 (silently
    // enrolls our ads in their cross-advertiser feed). The user has
    // explicitly required this OFF for every adset — setting at the
    // adset level is the only reliable opt-out per verified note in
    // multi_advertiser_off.md (creative-level contextual_multi_ads
    // is silently dropped by Meta in this configuration).
    multi_advertiser_ads: { state: "OPT_OUT" },
  };
  if (input.budgetMode === "ABO") {
    adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }
  const promoted = buildPromotedObject(
    input.objective,
    input.optimizationGoal,
    input.pageId,
    input.pixelId,
    input.customEventType,
    input.customConversionId,
  );
  if (promoted) adSetBody.promoted_object = promoted;

  // destination_type is REQUIRED for most ODAX objective + optimization
  // pairs. Without it, Meta rejects with "performance goal ไม่เข้ากับ
  // objective" because it can't infer where to send the user.
  const destinationType = buildDestinationType(input.objective, input.optimizationGoal);
  if (destinationType) adSetBody.destination_type = destinationType;
  if (input.budgetMode === "ABO") {
    if (input.adSetDailyBudget !== undefined) {
      adSetBody.daily_budget = String(thbToMinorUnits(input.adSetDailyBudget));
    } else if (input.adSetLifetimeBudget !== undefined) {
      adSetBody.lifetime_budget = String(thbToMinorUnits(input.adSetLifetimeBudget));
    }
  }
  if (input.startTime) adSetBody.start_time = input.startTime.toISOString();
  if (input.endTime) adSetBody.end_time = input.endTime.toISOString();

  let adSetMetaId: string;
  try {
    const res = await graphFetch<{ id: string }>(
      `/${input.metaAccountId}/adsets`,
      { method: "POST", accessToken, body: adSetBody },
    );
    adSetMetaId = res.id;
  } catch (err) {
    return logFailure(input, "adset", metaErrorMsg(err), { campaignMetaId }, accessToken);
  }

  // ---- 4. Create Creative ----
  let creativeBody: Record<string, unknown>;
  if (input.creative.kind === "existing_post") {
    // postId can arrive in 3 shapes from the UI:
    //   1. "<pageid>_<postid>"  — Meta canonical, ready to use
    //   2. "<postid>"           — just the post (we prepend pageid)
    //   3. "pfbid<base64...>"   — new Facebook URL ID, must be resolved
    let storyId = input.creative.postId;
    if (storyId.startsWith("pfbid")) {
      // Resolve pfbid → canonical post id by asking Meta directly.
      try {
        const resolved = await graphFetch<{ id: string }>(`/${storyId}`, {
          accessToken,
          searchParams: { fields: "id" },
        });
        storyId = resolved.id; // returns "<pageid>_<postid>"
      } catch (err) {
        return await logFailure(
          input,
          "creative",
          `แปลง pfbid post id ไม่สำเร็จ: ${(err as Error).message}`,
          { campaignMetaId, adSetMetaId },
        );
      }
    } else if (/^\d+$/.test(storyId)) {
      storyId = `${input.pageId}_${storyId}`;
    }
    creativeBody = {
      name: `${input.adName} creative`,
      object_story_id: storyId,
    };
  } else if (input.creative.kind === "video_reel") {
    // Reels are video objects, not feed posts — Marketing API rejects
    // object_story_id for them. Wrap in object_story_spec.video_data
    // using the bare video id. Fetch a thumbnail from /VIDEO_ID/thumbnails
    // because Meta requires image_url on video_data creatives.
    const videoId = input.creative.videoId;
    let thumbUrl: string | undefined;
    try {
      const thumbs = await graphFetch<{ data?: Array<{ uri: string; is_preferred?: boolean }> }>(
        `/${videoId}/thumbnails`,
        { accessToken },
      );
      const preferred = thumbs.data?.find((t) => t.is_preferred) ?? thumbs.data?.[0];
      thumbUrl = preferred?.uri;
    } catch (err) {
      return logFailure(
        input,
        "creative",
        `ดึง thumbnail ของ reel ไม่สำเร็จ: ${(err as Error).message}`,
        { campaignMetaId, adSetMetaId },
        accessToken,
      );
    }
    if (!thumbUrl) {
      return logFailure(
        input,
        "creative",
        "reel ไม่มี thumbnail",
        { campaignMetaId, adSetMetaId },
        accessToken,
      );
    }
    creativeBody = {
      name: `${input.adName} creative`,
      object_story_spec: {
        page_id: input.pageId,
        video_data: {
          video_id: videoId,
          image_url: thumbUrl,
          // message is optional — when omitted Meta uses the reel's caption.
          ...(input.creative.message ? { message: input.creative.message } : {}),
          call_to_action: { type: "LEARN_MORE", value: {} },
        },
      },
    };
  } else {
    // Need the page token for some object_story_spec endpoints; ad
    // account context here means user token is fine, but Meta accepts
    // either. We use user token for simplicity.
    void getPageAccessToken; // referenced for future page-scoped paths
    const cta = input.creative.callToAction;
    creativeBody = {
      name: `${input.adName} creative`,
      object_story_spec: {
        page_id: input.pageId,
        link_data: {
          link: input.creative.linkUrl,
          message: input.creative.primaryText,
          name: input.creative.headline,
          description: input.creative.description,
          image_hash: input.creative.imageHash,
          call_to_action: {
            type: cta,
            value: { link: input.creative.linkUrl },
          },
        },
      },
    };
  }

  let creativeId: string;
  try {
    const res = await graphFetch<{ id: string }>(
      `/${input.metaAccountId}/adcreatives`,
      { method: "POST", accessToken, body: creativeBody },
    );
    creativeId = res.id;
  } catch (err) {
    return logFailure(
      input,
      "creative",
      metaErrorMsg(err),
      { campaignMetaId, adSetMetaId },
      accessToken,
    );
  }

  // ---- 5. Create Ad ----
  let adMetaId: string;
  try {
    const res = await graphFetch<{ id: string }>(`/${input.metaAccountId}/ads`, {
      method: "POST",
      accessToken,
      body: {
        name: input.adName,
        adset_id: adSetMetaId,
        creative: { creative_id: creativeId },
        status,
      },
    });
    adMetaId = res.id;
  } catch (err) {
    return logFailure(
      input,
      "ad",
      metaErrorMsg(err),
      { campaignMetaId, adSetMetaId, creativeId },
      accessToken,
    );
  }

  // ---- 6. Sync into our DB ----
  let campaignInternalId: string;
  let adSetInternalId: string;
  let adInternalId: string;
  try {
    const campaign = await prisma.metaCampaign.upsert({
      where: {
        metaConnectionId_metaCampaignId: {
          metaConnectionId: connection.id,
          metaCampaignId: campaignMetaId,
        },
      },
      update: {
        name: input.campaignName,
        metaObjective: input.objective,
        effectiveStatus: status,
        configuredStatus: status,
        dailyBudget:
          input.budgetMode === "CBO" && input.campaignDailyBudget !== undefined
            ? thbToMinorUnits(input.campaignDailyBudget)
            : null,
        lifetimeBudget:
          input.budgetMode === "CBO" && input.campaignLifetimeBudget !== undefined
            ? thbToMinorUnits(input.campaignLifetimeBudget)
            : null,
        metaAccountId: input.metaAccountId,
        lastFetchedAt: new Date(),
      },
      create: {
        metaConnectionId: connection.id,
        metaCampaignId: campaignMetaId,
        metaAccountId: input.metaAccountId,
        name: input.campaignName,
        metaObjective: input.objective,
        effectiveStatus: status,
        configuredStatus: status,
        dailyBudget:
          input.budgetMode === "CBO" && input.campaignDailyBudget !== undefined
            ? thbToMinorUnits(input.campaignDailyBudget)
            : null,
        lifetimeBudget:
          input.budgetMode === "CBO" && input.campaignLifetimeBudget !== undefined
            ? thbToMinorUnits(input.campaignLifetimeBudget)
            : null,
      },
    });
    campaignInternalId = campaign.id;

    const adSet = await prisma.metaAdSet.upsert({
      where: { metaAdSetId: adSetMetaId },
      update: {
        name: input.adSetName,
        metaCampaignInternalId: campaign.id,
        dailyBudget:
          input.budgetMode === "ABO" && input.adSetDailyBudget !== undefined
            ? thbToMinorUnits(input.adSetDailyBudget)
            : null,
        lifetimeBudget:
          input.budgetMode === "ABO" && input.adSetLifetimeBudget !== undefined
            ? thbToMinorUnits(input.adSetLifetimeBudget)
            : null,
        targeting: input.targeting as never,
        optimizationGoal: input.optimizationGoal,
        billingEvent: input.billingEvent,
        startTime: input.startTime,
        endTime: input.endTime,
        effectiveStatus: status,
        configuredStatus: status,
        lastFetchedAt: new Date(),
      },
      create: {
        metaAdSetId: adSetMetaId,
        metaCampaignInternalId: campaign.id,
        name: input.adSetName,
        dailyBudget:
          input.budgetMode === "ABO" && input.adSetDailyBudget !== undefined
            ? thbToMinorUnits(input.adSetDailyBudget)
            : null,
        lifetimeBudget:
          input.budgetMode === "ABO" && input.adSetLifetimeBudget !== undefined
            ? thbToMinorUnits(input.adSetLifetimeBudget)
            : null,
        targeting: input.targeting as never,
        optimizationGoal: input.optimizationGoal,
        billingEvent: input.billingEvent,
        startTime: input.startTime,
        endTime: input.endTime,
        effectiveStatus: status,
        configuredStatus: status,
      },
    });
    adSetInternalId = adSet.id;

    const ad = await prisma.metaAd.upsert({
      where: { metaAdId: adMetaId },
      update: {
        name: input.adName,
        metaAdSetInternalId: adSet.id,
        creativeId,
        effectiveStatus: status,
        configuredStatus: status,
        lastFetchedAt: new Date(),
      },
      create: {
        metaAdId: adMetaId,
        metaAdSetInternalId: adSet.id,
        name: input.adName,
        creativeId,
        effectiveStatus: status,
        configuredStatus: status,
      },
    });
    adInternalId = ad.id;
  } catch (err) {
    return logFailure(input, "sync", `DB sync failed: ${(err as Error).message}`, {
      campaignMetaId,
      adSetMetaId,
      creativeId,
    });
  }

  // ---- 7. Audit log + invalidate cache ----
  const log = await prisma.campaignActionLog.create({
    data: {
      tenantId: input.tenantId,
      campaignId: campaignInternalId,
      metaCampaignId: campaignMetaId,
      userId: input.userId,
      action: "CREATE",
      afterStatus: "PAUSED",
      afterValue: {
        campaignMetaId,
        adSetMetaId,
        adMetaId,
        creativeId,
        objective: input.objective,
        budgetMode: input.budgetMode,
      } as never,
      result: "SUCCESS",
    },
  });

  await invalidateDashboardCache(input.tenantId).catch(() => {});

  return {
    ok: true,
    campaign: {
      internalId: campaignInternalId,
      metaId: campaignMetaId,
      name: input.campaignName,
    },
    adSet: { internalId: adSetInternalId, metaId: adSetMetaId, name: input.adSetName },
    ad: { internalId: adInternalId, metaId: adMetaId, name: input.adName },
    logId: log.id,
  };

  // adMetaId is reassigned mid-function — assigned above; `// adMetaId`
  // referenced via `where: { metaAdId }` (TS needs binding); we use it
  // through the local closure.
  // (eslint may warn — silence by hoisting if needed.)
}

// Helpers --------------------------------------------------------------

/**
 * Build the `promoted_object` payload Meta requires on the ad set.
 *
 * Rules learned via live testing against v23 Marketing API:
 *   - OUTCOME_ENGAGEMENT + ANY optimization → requires promoted_object.page_id
 *     (Meta complains about "conversion source missing" otherwise)
 *   - OUTCOME_LEADS + CONVERSATIONS → requires page_id + custom_event_type
 *   - OUTCOME_SALES + CONVERSATIONS → same
 *   - OUTCOME_AWARENESS / TRAFFIC + REACH/IMPRESSIONS/LINK_CLICKS → no
 *     promoted_object needed (verified working without it)
 *   - OUTCOME_SALES + OFFSITE_CONVERSIONS/VALUE → needs Pixel (not built)
 *   - OUTCOME_APP_PROMOTION + APP_INSTALLS → needs app_id (not built)
 */
function buildPromotedObject(
  objective: string,
  optimizationGoal: string,
  pageId: string,
  pixelId: string | undefined,
  customEventType: string | undefined,
  customConversionId: string | undefined,
): Record<string, unknown> | undefined {
  // Pixel-based conversion goals: OFFSITE_CONVERSIONS optimizes for the
  // event; VALUE optimizes for revenue (still pixel-scoped). Two paths:
  //   - Custom Conversion (preferred): pixel_id + custom_conversion_id
  //     (URL rule-based, no website event code needed)
  //   - Standard Event: pixel_id + custom_event_type (requires pixel
  //     event code on the website to fire the event)
  // The two are mutually exclusive per Meta's API.
  if (optimizationGoal === "OFFSITE_CONVERSIONS" || optimizationGoal === "VALUE") {
    if (!pixelId) return undefined;
    if (customConversionId) {
      return { pixel_id: pixelId, custom_conversion_id: customConversionId };
    }
    if (customEventType) {
      return { pixel_id: pixelId, custom_event_type: customEventType };
    }
    return undefined;
  }

  // Messaging-based goals always need page_id + the conversation event.
  // Meta v23 accepts `MESSAGING_CONVERSATION_STARTED_7D` (note: singular
  // CONVERSATION, with `_7D` suffix). The plural form is rejected.
  if (optimizationGoal === "CONVERSATIONS") {
    return {
      page_id: pageId,
      custom_event_type: "MESSAGING_CONVERSATION_STARTED_7D",
    };
  }

  // Lead form goals need page_id (and ideally lead_gen_form_id).
  if (optimizationGoal === "LEAD_GENERATION" || optimizationGoal === "QUALITY_LEAD") {
    return { page_id: pageId };
  }

  // The Engagement objective itself requires a promoted entity even when
  // the optimization is just REACH/IMPRESSIONS. This is undocumented but
  // confirmed via 502 errors during testing.
  if (objective === "OUTCOME_ENGAGEMENT") {
    return { page_id: pageId };
  }

  // Page-scoped optimization goals under other objectives still need page_id.
  if (
    optimizationGoal === "POST_ENGAGEMENT" ||
    optimizationGoal === "PAGE_LIKES" ||
    optimizationGoal === "THRUPLAY"
  ) {
    return { page_id: pageId };
  }

  return undefined;
}

/**
 * The destination_type field on Meta's ad set tells the API where the
 * user lands when they click. Required for most ODAX combos — Meta
 * rejects the ad set with a cryptic "performance goal not allowed"
 * error when it's missing.
 *
 * Mappings derived from Meta v23 Marketing API docs:
 *   WEBSITE       — link_data creative driving to URL
 *   MESSENGER     — Click-to-Messenger flow
 *   ON_AD         — engagement on the ad itself (reach/impressions)
 *   ON_PAGE       — drives to Page (e.g. PAGE_LIKES)
 *   ON_POST       — interacts with the post directly
 *   APP           — app install / engagement
 *   INSTAGRAM_PROFILE — IG profile visits
 *   PHONE_CALL    — click-to-call
 */
function buildDestinationType(
  objective: string,
  optimizationGoal: string,
): string | undefined {
  // Messaging across all objectives → MESSENGER
  if (optimizationGoal === "CONVERSATIONS") return "MESSENGER";

  // Lead generation (form) → ON_AD (the form is in the ad itself)
  if (optimizationGoal === "LEAD_GENERATION" || optimizationGoal === "QUALITY_LEAD") {
    return "ON_AD";
  }

  // App install → APP
  if (optimizationGoal === "APP_INSTALLS") return "APP";

  // Page-engagement variants land on the Page
  if (optimizationGoal === "PAGE_LIKES") return "ON_PAGE";
  if (optimizationGoal === "POST_ENGAGEMENT") return "ON_POST";

  // Traffic + sales LINK_CLICKS/LANDING_PAGE_VIEWS → external WEBSITE
  if (
    optimizationGoal === "LINK_CLICKS" ||
    optimizationGoal === "LANDING_PAGE_VIEWS" ||
    optimizationGoal === "OFFSITE_CONVERSIONS" ||
    optimizationGoal === "VALUE"
  ) {
    return "WEBSITE";
  }

  // REACH / IMPRESSIONS / THRUPLAY / AD_RECALL_LIFT → no explicit
  // destination. Meta rejects `ON_AD` for these as of v23.0 — only
  // MESSENGER / UNDEFINED / WEBSITE / APP are accepted, so we leave
  // it unset and let Meta apply its default (UNDEFINED).
  if (
    optimizationGoal === "REACH" ||
    optimizationGoal === "IMPRESSIONS" ||
    optimizationGoal === "AD_RECALL_LIFT" ||
    optimizationGoal === "THRUPLAY"
  ) {
    return undefined;
  }

  return undefined;
}

function metaErrorMsg(err: unknown): string {
  const e = err as Error & { userMessage?: string };
  return e.userMessage ?? e.message ?? "Unknown Meta error";
}

/**
 * Roll back partial Meta entities on failure. Deleting the campaign
 * cascades to its adsets/ads/creatives in Meta — one DELETE is enough.
 *
 * Skipped when `failedAt === "sync"`: the Meta entities created
 * successfully and the user may still want them; only our local DB
 * write failed, which we recover by re-syncing.
 *
 * Also removes any DB rows that may have been written by background
 * sync jobs that raced ahead of the failure path — keeps DB and Meta
 * consistent even if a poll happened mid-create.
 */
async function rollbackPartialCreation(
  input: CreateInput,
  failedAt: "campaign" | "adset" | "creative" | "ad" | "sync",
  partial: { campaignMetaId?: string; adSetMetaId?: string; creativeId?: string },
  accessToken: string,
): Promise<void> {
  if (failedAt === "sync") return;
  if (!partial.campaignMetaId) return;

  // Meta: delete the campaign — cascades to adset, creative, ad
  try {
    await graphFetch(`/${partial.campaignMetaId}`, { method: "DELETE", accessToken });
  } catch {
    // Best-effort — if Meta deletion fails (already gone, permission glitch),
    // we still proceed to DB cleanup so the local view stays accurate.
  }

  // DB: delete any campaign row that may exist (background sync could have
  // written it between create and our failure). Cascades to adsets/ads.
  try {
    await prisma.metaCampaign.deleteMany({
      where: { metaCampaignId: partial.campaignMetaId },
    });
  } catch {
    // Best-effort.
  }
}

async function logFailure(
  input: CreateInput,
  failedAt: "campaign" | "adset" | "creative" | "ad" | "sync",
  error: string,
  partial: { campaignMetaId?: string; adSetMetaId?: string; creativeId?: string },
  accessToken?: string,
): Promise<CreateResult> {
  // Rollback FIRST — if log write fails we still want the rollback to happen.
  if (accessToken) {
    await rollbackPartialCreation(input, failedAt, partial, accessToken);
  }

  // Best-effort audit — even without a campaign row to FK to. We use
  // the source ad-account id as a stand-in for campaignId so the row is
  // searchable by Meta account.
  const log = await prisma.campaignActionLog.create({
    data: {
      tenantId: input.tenantId,
      campaignId: partial.campaignMetaId ?? "create-failed",
      metaCampaignId: partial.campaignMetaId ?? input.metaAccountId,
      userId: input.userId,
      action: "CREATE",
      result: "FAILED",
      errorMessage: `[${failedAt}] ${error}`,
      afterValue: partial as never,
    },
  });
  return { ok: false, failedAt, error, partial, logId: log.id };
}

async function logFailureNoMeta(
  input: CreateInput,
  failedAt: "campaign" | "adset" | "creative" | "ad" | "sync",
  error: string,
): Promise<CreateResult> {
  return logFailure(input, failedAt, error, {});
}
