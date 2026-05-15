/**
 * Boost the CPS founder's 2 reels:
 *   FB: facebook.com/reel/1459228105372710 → ฿1,000, REACH, FB-only, 7d
 *   IG: instagram.com/reel/DYURHCBA8NQ    → ฿1,000, REACH, IG-only, 7d
 *
 * Names follow recent CPS pattern:
 *   CPS0526 | {TITLE} | Mass {FB|IG} Reach | ฿1,000/7d Lifetime CBO
 *
 * Creates PAUSED. User can ACTIVATE after review.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const FB_PAGE_ID = "124772487582930"; // CPS
const FB_VIDEO_ID = "1459228105372710";
const IG_SHORTCODE = "DYURHCBA8NQ";
const ACCOUNT = "act_1006870751067315"; // Digittribe
const BUDGET_THB = 1000;
const DURATION_DAYS = 7;

const START_TIME = new Date(Date.now() + 5 * 60_000); // +5 min
const END_TIME = new Date(START_TIME.getTime() + DURATION_DAYS * 24 * 60 * 60_000);

async function fb<T = unknown>(
  path: string,
  token: string,
  body?: object,
): Promise<{ status: number; body: T }> {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function getPageToken(userToken: string): Promise<string | null> {
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
    url.searchParams.set("fields", "id,access_token,instagram_business_account");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    url.searchParams.set("access_token", userToken);
    const res = await fetch(url.toString());
    const body = (await res.json()) as {
      data?: Array<{ id: string; access_token?: string; instagram_business_account?: { id: string } }>;
      paging?: { cursors?: { after?: string } };
    };
    const match = body.data?.find((p) => p.id === FB_PAGE_ID);
    if (match?.access_token) return match.access_token;
    if (!body.paging?.cursors?.after) break;
    cursor = body.paging.cursors.after;
  }
  return null;
}

async function resolveReelPostId(pageToken: string, videoId: string): Promise<string | null> {
  let next: string | null = `https://graph.facebook.com/v23.0/${FB_PAGE_ID}/video_reels?fields=id,post_id&limit=100&access_token=${pageToken}`;
  for (let i = 0; i < 5 && next; i++) {
    const res = await fetch(next);
    const body = (await res.json()) as {
      data?: Array<{ id: string; post_id?: string }>;
      paging?: { next?: string };
    };
    const match = body.data?.find((r) => r.id === videoId);
    if (match?.post_id) return match.post_id;
    next = body.paging?.next ?? null;
  }
  return null;
}

async function resolveIgMedia(
  pageToken: string,
  userToken: string,
  shortcode: string,
): Promise<{ igUserId: string; mediaId: string; caption?: string } | null> {
  // Find IG business account linked to CPS page
  const pageInfo = await fb<{ instagram_business_account?: { id: string } }>(
    `/${FB_PAGE_ID}?fields=instagram_business_account`,
    pageToken,
  );
  const igId = pageInfo.body.instagram_business_account?.id;
  if (!igId) {
    // Try via user token in case page-level doesn't expose it
    const pageInfo2 = await fb<{ instagram_business_account?: { id: string } }>(
      `/${FB_PAGE_ID}?fields=instagram_business_account`,
      userToken,
    );
    if (!pageInfo2.body.instagram_business_account?.id) return null;
  }
  const igUserId = igId ?? (await fb<{ instagram_business_account?: { id: string } }>(
    `/${FB_PAGE_ID}?fields=instagram_business_account`,
    userToken,
  )).body.instagram_business_account?.id;
  if (!igUserId) return null;
  console.log(`  IG business account: ${igUserId}`);

  // List recent media + find by permalink shortcode
  const permalinkMatch = (p: string) => p.includes(`/${shortcode}/`) || p.includes(`/${shortcode}?`);
  let next: string | null = `https://graph.facebook.com/v23.0/${igUserId}/media?fields=id,permalink,caption,media_type&limit=100&access_token=${pageToken}`;
  for (let i = 0; i < 5 && next; i++) {
    const res = await fetch(next);
    const body = (await res.json()) as {
      data?: Array<{ id: string; permalink: string; caption?: string }>;
      paging?: { next?: string };
    };
    const m = body.data?.find((x) => permalinkMatch(x.permalink));
    if (m) return { igUserId, mediaId: m.id, caption: m.caption };
    next = body.paging?.next ?? null;
  }
  return null;
}

function deriveTitle(caption: string | undefined, fallback: string): string {
  if (!caption) return fallback;
  // Take first sentence, trim mentions/hashtags, truncate to 35 chars
  const firstLine = caption.split(/[.\n]/)[0].trim();
  const cleaned = firstLine
    .replace(/@\w+/g, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return fallback;
  if (cleaned.length <= 35) return cleaned;
  return cleaned.slice(0, 35).trim();
}

type BoostInput = {
  platform: "FB" | "IG";
  campaignName: string;
  pageId: string;
  igUserId?: string;
  creative:
    | { kind: "existing_post"; postId: string }
    | { kind: "ig_media"; igUserId: string; mediaId: string };
};

async function createCampaignTree(input: BoostInput, accessToken: string) {
  console.log(`\n━━━ Creating ${input.platform} campaign: ${input.campaignName} ━━━`);

  // 1. Campaign
  const camp = await fb<{ id?: string; error?: { message: string } }>(
    `/${ACCOUNT}/campaigns`,
    accessToken,
    {
      name: input.campaignName,
      objective: "OUTCOME_AWARENESS",
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
      lifetime_budget: String(BUDGET_THB * 100), // satang
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    },
  );
  if (camp.body.error) {
    console.log(`  ✗ Campaign: ${camp.body.error.message}`);
    return null;
  }
  const campaignId = camp.body.id!;
  console.log(`  ✓ Campaign: ${campaignId}`);

  // 2. AdSet
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: ["TH"], location_types: ["home", "recent"] },
    age_min: 20,
    age_max: 60,
    publisher_platforms: input.platform === "FB" ? ["facebook"] : ["instagram"],
    targeting_automation: { advantage_audience: 0 },
  };
  if (input.platform === "FB") {
    targeting.facebook_positions = ["feed", "facebook_reels", "profile_feed", "story"];
  } else {
    targeting.instagram_positions = ["stream", "reels", "story", "explore", "explore_home"];
  }

  const adset = await fb<{ id?: string; error?: { message: string } }>(
    `/${ACCOUNT}/adsets`,
    accessToken,
    {
      name: `${input.campaignName} — Ad Set`,
      campaign_id: campaignId,
      status: "PAUSED",
      optimization_goal: "REACH",
      billing_event: "IMPRESSIONS",
      targeting,
      start_time: START_TIME.toISOString(),
      end_time: END_TIME.toISOString(),
      multi_advertiser_ads: { state: "OPT_OUT" },
    },
  );
  if (adset.body.error) {
    console.log(`  ✗ AdSet: ${adset.body.error.message}`);
    return null;
  }
  const adSetId = adset.body.id!;
  console.log(`  ✓ AdSet: ${adSetId}`);

  // 3. Creative
  let creativeBody: Record<string, unknown>;
  if (input.creative.kind === "existing_post") {
    creativeBody = {
      name: `${input.campaignName} — Creative`,
      object_story_id: input.creative.postId,
    };
  } else {
    // IG media boost via instagram_actor_id + effective IG media reference
    creativeBody = {
      name: `${input.campaignName} — Creative`,
      object_story_spec: {
        page_id: input.pageId,
        instagram_actor_id: input.creative.igUserId,
      },
      instagram_permalink_url: `https://www.instagram.com/reel/${IG_SHORTCODE}/`,
      source_instagram_media_id: input.creative.mediaId,
    };
  }
  const creative = await fb<{ id?: string; error?: { message: string } }>(
    `/${ACCOUNT}/adcreatives`,
    accessToken,
    creativeBody,
  );
  if (creative.body.error) {
    console.log(`  ✗ Creative: ${creative.body.error.message}`);
    return null;
  }
  const creativeId = creative.body.id!;
  console.log(`  ✓ Creative: ${creativeId}`);

  // 4. Ad
  const ad = await fb<{ id?: string; error?: { message: string } }>(
    `/${ACCOUNT}/ads`,
    accessToken,
    {
      name: `${input.campaignName} — Ad`,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    },
  );
  if (ad.body.error) {
    console.log(`  ✗ Ad: ${ad.body.error.message}`);
    return null;
  }
  console.log(`  ✓ Ad: ${ad.body.id}`);
  return { campaignId, adSetId, adId: ad.body.id };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const userToken = decrypt(conn.accessTokenEncrypted);
  const pageToken = await getPageToken(userToken);
  if (!pageToken) {
    console.log("✗ Cannot get Page token for CPS page");
    await prisma.$disconnect();
    return;
  }

  // FB reel
  console.log("\n━━━ Resolve FB reel ━━━");
  const fbInfo = await fb<{ description?: string }>(
    `/${FB_VIDEO_ID}?fields=description`,
    pageToken,
  );
  const fbPostId = await resolveReelPostId(pageToken, FB_VIDEO_ID);
  if (!fbPostId) {
    console.log(`✗ Cannot resolve FB reel ${FB_VIDEO_ID} post_id`);
    await prisma.$disconnect();
    return;
  }
  const fbTitle = deriveTitle(fbInfo.body.description, "FB Reel");
  console.log(`  FB title: "${fbTitle}"`);
  console.log(`  FB post_id: ${fbPostId}`);

  // IG reel
  console.log("\n━━━ Resolve IG reel ━━━");
  const ig = await resolveIgMedia(pageToken, userToken, IG_SHORTCODE);
  if (!ig) {
    console.log(`✗ Cannot resolve IG reel ${IG_SHORTCODE}`);
    await prisma.$disconnect();
    return;
  }
  const igTitle = deriveTitle(ig.caption, "IG Reel");
  console.log(`  IG title: "${igTitle}"`);
  console.log(`  IG media_id: ${ig.mediaId}`);

  // Build names + boost
  const fbName = `CPS0526 | ${fbTitle} | Mass FB Reach | ฿1,000/7d Lifetime CBO`;
  const igName = `CPS0526 | ${igTitle} | Mass IG Reach | ฿1,000/7d Lifetime CBO`;

  const fbResult = await createCampaignTree(
    {
      platform: "FB",
      campaignName: fbName,
      pageId: FB_PAGE_ID,
      creative: { kind: "existing_post", postId: `${FB_PAGE_ID}_${fbPostId}` },
    },
    userToken,
  );

  const igResult = await createCampaignTree(
    {
      platform: "IG",
      campaignName: igName,
      pageId: FB_PAGE_ID,
      igUserId: ig.igUserId,
      creative: { kind: "ig_media", igUserId: ig.igUserId, mediaId: ig.mediaId },
    },
    userToken,
  );

  console.log("\n━━━ Summary ━━━");
  console.log(`FB: ${fbResult ? `✓ campaign ${fbResult.campaignId}` : "✗ failed"}`);
  console.log(`IG: ${igResult ? `✓ campaign ${igResult.campaignId}` : "✗ failed"}`);
  console.log("\nBoth created as PAUSED. Reply 'activate' to flip them ACTIVE.");

  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
