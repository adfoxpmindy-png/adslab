/**
 * Recovery: pause the two empty ACTIVE campaigns from the first attempt,
 * then add adsets+ads to them using advantage_audience=1.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const ACCOUNT = "act_1856743671701430";
const PAGE_ID = "903715949495532";
const POST_ID = "122128256793187956";
const OBJECT_STORY_ID = `${PAGE_ID}_${POST_ID}`;

const REACH_CAMP = "120243957988980714";
const ENGAGE_CAMP = "120243958001750714";
// Creatives already created in first run (both campaigns got the same OBJECT_STORY_ID)
const REACH_CREATIVE = "842272118437616";
const ENGAGE_CREATIVE = "842272118437616"; // same — first run created two with same id

const START = new Date(Date.now() + 5 * 60_000);
const END = new Date("2026-05-22T23:59:00+07:00");

const BANGKOK_GEO = {
  regions: [{ key: "3793" }],
  location_types: ["home", "recent"],
};

type Audience = {
  label: string;
  age_min: number;
  age_max: number;
  interests: Array<{ id: string; name: string }>;
  behaviors?: Array<{ id: string; name: string }>;
};

const AUDIENCES: Audience[] = [
  {
    label: "A1_Families",
    age_min: 28,
    age_max: 45,
    interests: [
      { id: "6003902462066", name: "สวนสนุก" },
      { id: "6003737012891", name: "Parenting" },
      { id: "6003704126313", name: "อาหารเด็กทารก" },
    ],
  },
  {
    label: "A2_Couples_Insta",
    age_min: 20,
    age_max: 32,
    interests: [
      { id: "6003899195666", name: "การถ่ายรูป" },
      { id: "6003670602220", name: "Instagram" },
      { id: "6003594536273", name: "Fashion & Make Up" },
      { id: "6787836449986", name: "ร้านอาหารแบบสบายๆ" },
    ],
  },
  {
    label: "A3_Travelers",
    age_min: 25,
    age_max: 50,
    interests: [
      { id: "6003121064322", name: "Travel + Leisure" },
      { id: "6003349868805", name: "Travel Adventures" },
      { id: "6777460559594", name: "Travel booking services" },
    ],
  },
];

async function api(p: string, token: string, body: object, method: "POST" = "POST") {
  const url = new URL(`https://graph.facebook.com/v23.0${p}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json()) as { id?: string; success?: boolean; error?: { message: string; error_user_msg?: string } };
}

async function createAdsets(
  token: string,
  campLabel: string,
  campId: string,
  creativeId: string,
  optimizationGoal: "REACH" | "POST_ENGAGEMENT",
) {
  console.log(`\n━━━ ${campLabel} (${campId})`);
  let okCount = 0;
  for (const aud of AUDIENCES) {
    const body = {
      name: `${campLabel} — ${aud.label}`,
      campaign_id: campId,
      status: "ACTIVE",
      optimization_goal: optimizationGoal,
      billing_event: "IMPRESSIONS",
      targeting: {
        geo_locations: BANGKOK_GEO,
        age_min: aud.age_min,
        age_max: aud.age_max,
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
      end_time: END.toISOString(),
      multi_advertiser_ads: { state: "OPT_OUT" },
    };
    const adset = await api(`/${ACCOUNT}/adsets`, token, body);
    if (adset.error || !adset.id) {
      console.log(`  ✗ AdSet ${aud.label}: ${adset.error?.error_user_msg ?? adset.error?.message}`);
      continue;
    }
    console.log(`  ✓ AdSet ${aud.label} ${adset.id}`);

    const ad = await api(`/${ACCOUNT}/ads`, token, {
      name: `${campLabel} — ${aud.label} — ad`,
      adset_id: adset.id,
      creative: { creative_id: creativeId },
      status: "ACTIVE",
    });
    if (ad.error || !ad.id) {
      console.log(`  ✗ Ad ${aud.label}: ${ad.error?.error_user_msg ?? ad.error?.message}`);
      continue;
    }
    console.log(`  ✓ Ad ${aud.label} ${ad.id}`);
    okCount++;
  }
  return okCount;
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  console.log("Recovery — Snowyn Boost");
  console.log("=======================");

  const r = await createAdsets(token, "Snowyn Reach", REACH_CAMP, REACH_CREATIVE, "REACH");
  const e = await createAdsets(token, "Snowyn Engagement", ENGAGE_CAMP, ENGAGE_CREATIVE, "POST_ENGAGEMENT");

  console.log("\n=======================");
  console.log(`Reach:      ${r}/3 adsets+ads`);
  console.log(`Engagement: ${e}/3 adsets+ads`);
  console.log(`\nAds Manager: https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1856743671701430&selected_campaign_ids=${REACH_CAMP},${ENGAGE_CAMP}`);

  await prisma.$disconnect();
}

main().catch(console.error);
