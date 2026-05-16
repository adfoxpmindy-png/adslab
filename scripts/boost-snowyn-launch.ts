/**
 * Boost Snowyn Wonderland's launch post — 2 campaigns × 3 audiences.
 *
 *   Campaign 1: REACH      ฿1,000 lifetime CBO, 3 adsets
 *   Campaign 2: ENGAGEMENT ฿2,000 lifetime CBO, 3 adsets
 *
 * Same creative (object_story_id) in every adset; status ACTIVE per
 * the user's "ยิงเลย" authorization.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const ACCOUNT = "act_1856743671701430"; // FROST Magical Ice Of Siam
const PAGE_ID = "903715949495532"; // Snowyn Wonderland
const POST_ID = "122128256793187956"; // launch announcement 2026-05-16
const OBJECT_STORY_ID = `${PAGE_ID}_${POST_ID}`;

// 16-22 พ.ค. — start now+5min, end 22 พ.ค. 23:59 BKK = 16:59 UTC
const START = new Date(Date.now() + 5 * 60_000);
const END_BKK_LOCAL = new Date("2026-05-22T23:59:00+07:00");

// Bangkok region only. Region key "3793" is Bangkok province per Meta.
const BANGKOK_GEO = {
  regions: [{ key: "3793" }],
  location_types: ["home", "recent"],
};

type Audience = {
  label: string;
  age_min: number;
  age_max: number;
  genders?: number[]; // omit = all
  // Use flexible_spec with single inclusion group for OR-ing interests
  interests: Array<{ id?: string; name: string }>;
  behaviors?: Array<{ id: string; name: string }>;
};

// Interest IDs from Meta's targeting taxonomy. Using broad / popular IDs
// that have wide audience reach in Thailand. We pass names too so Meta
// can validate.
const AUDIENCES: Audience[] = [
  {
    label: "A1_Families",
    age_min: 28,
    age_max: 45,
    interests: [
      { id: "6003020834693", name: "Family" },
      { id: "6003251053169", name: "Parenting" },
      { id: "6003659420364", name: "Children" },
      { id: "6003353954195", name: "Theme parks" },
    ],
  },
  {
    label: "A2_Couples_Insta",
    age_min: 20,
    age_max: 32,
    interests: [
      { id: "6003020538099", name: "Photography" },
      { id: "6003277229371", name: "Instagram" },
      { id: "6003397425735", name: "Travel" },
      { id: "6003123299417", name: "Fashion" },
    ],
  },
  {
    label: "A3_Travelers",
    age_min: 25,
    age_max: 50,
    interests: [
      { id: "6003397425735", name: "Travel" },
      { id: "6003217733287", name: "Tourism" },
      { id: "6002991358171", name: "Bangkok" },
    ],
    behaviors: [
      { id: "6002714895372", name: "Frequent Travelers" },
    ],
  },
];

async function api(
  path: string,
  token: string,
  body: object,
  method: "POST" | "GET" = "POST",
) {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  url.searchParams.set("access_token", token);
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (method === "POST") opts.body = JSON.stringify(body);
  const r = await fetch(url.toString(), opts);
  return (await r.json()) as { id?: string; error?: { message: string; type?: string; code?: number; error_user_msg?: string } };
}

async function buildCampaign(
  token: string,
  args: {
    name: string;
    objective: "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT";
    lifetime_budget_satang: number;
    optimization_goal: "REACH" | "POST_ENGAGEMENT";
  },
): Promise<{ campId: string; adsets: Array<{ id: string; label: string }>; ads: Array<{ id: string; label: string }> }> {
  console.log(`\n━━━ ${args.name} ━━━`);

  // 1. Campaign (CBO via lifetime_budget on campaign)
  const camp = await api(`/${ACCOUNT}/campaigns`, token, {
    name: args.name,
    objective: args.objective,
    status: "ACTIVE",
    special_ad_categories: [],
    buying_type: "AUCTION",
    lifetime_budget: String(args.lifetime_budget_satang),
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });
  if (camp.error || !camp.id) throw new Error(`Campaign: ${camp.error?.message}`);
  console.log(`  ✓ Campaign ${camp.id}`);

  // 2. One creative — reused across adsets (single Ad per adset, same creative)
  const creative = await api(`/${ACCOUNT}/adcreatives`, token, {
    name: `${args.name} — creative`,
    object_story_id: OBJECT_STORY_ID,
  });
  if (creative.error || !creative.id) throw new Error(`Creative: ${creative.error?.message}`);
  console.log(`  ✓ Creative ${creative.id}`);

  const adsets: Array<{ id: string; label: string }> = [];
  const ads: Array<{ id: string; label: string }> = [];

  // 3. 3 adsets, one per audience
  for (const aud of AUDIENCES) {
    const adset = await api(`/${ACCOUNT}/adsets`, token, {
      name: `${args.name} — ${aud.label}`,
      campaign_id: camp.id,
      status: "ACTIVE",
      optimization_goal: args.optimization_goal,
      billing_event: "IMPRESSIONS",
      targeting: {
        geo_locations: BANGKOK_GEO,
        age_min: aud.age_min,
        age_max: aud.age_max,
        ...(aud.genders ? { genders: aud.genders } : {}),
        flexible_spec: [
          {
            interests: aud.interests,
            ...(aud.behaviors ? { behaviors: aud.behaviors } : {}),
          },
        ],
        publisher_platforms: ["facebook"],
        facebook_positions: ["feed", "facebook_reels", "profile_feed", "story"],
        targeting_automation: { advantage_audience: 0 },
      },
      start_time: START.toISOString(),
      end_time: END_BKK_LOCAL.toISOString(),
      multi_advertiser_ads: { state: "OPT_OUT" },
    });
    if (adset.error || !adset.id) {
      console.log(`  ✗ AdSet ${aud.label}: ${adset.error?.message}`);
      continue;
    }
    console.log(`  ✓ AdSet ${aud.label} ${adset.id}`);
    adsets.push({ id: adset.id, label: aud.label });

    const ad = await api(`/${ACCOUNT}/ads`, token, {
      name: `${args.name} — ${aud.label} — ad`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: "ACTIVE",
    });
    if (ad.error || !ad.id) {
      console.log(`  ✗ Ad ${aud.label}: ${ad.error?.message}`);
      continue;
    }
    console.log(`  ✓ Ad ${aud.label} ${ad.id}`);
    ads.push({ id: ad.id, label: aud.label });
  }

  return { campId: camp.id, adsets, ads };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  console.log("Snowyn Wonderland — 2-Campaign Boost");
  console.log("=====================================");
  console.log(`Account:  ${ACCOUNT}`);
  console.log(`Page:     ${PAGE_ID}`);
  console.log(`Post:     ${POST_ID}`);
  console.log(`Start:    ${START.toISOString()}`);
  console.log(`End:      ${END_BKK_LOCAL.toISOString()}`);
  console.log(`Status:   ACTIVE`);

  const reach = await buildCampaign(token, {
    name: "Snowyn0526 | Launch | BKK Reach | ฿1,000/7d CBO",
    objective: "OUTCOME_AWARENESS",
    lifetime_budget_satang: 100_000, // ฿1,000
    optimization_goal: "REACH",
  });

  const engage = await buildCampaign(token, {
    name: "Snowyn0526 | Launch | BKK Engagement | ฿2,000/7d CBO",
    objective: "OUTCOME_ENGAGEMENT",
    lifetime_budget_satang: 200_000, // ฿2,000
    optimization_goal: "POST_ENGAGEMENT",
  });

  console.log("\n=====================================");
  console.log("Summary");
  console.log(`  Reach campaign:      ${reach.campId}`);
  console.log(`    adsets:            ${reach.adsets.length}/3`);
  console.log(`    ads:               ${reach.ads.length}/3`);
  console.log(`  Engagement campaign: ${engage.campId}`);
  console.log(`    adsets:            ${engage.adsets.length}/3`);
  console.log(`    ads:               ${engage.ads.length}/3`);

  console.log(`\nVerify in Ads Manager:`);
  console.log(`  https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1856743671701430&selected_campaign_ids=${reach.campId},${engage.campId}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
