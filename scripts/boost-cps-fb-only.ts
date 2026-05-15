/**
 * Fire the FB-only CPS boost. ฿1,000 lifetime, REACH, 7 days, PAUSED.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const FB_PAGE_ID = "124772487582930";
const FB_POST_ID = "1302685845384975"; // resolved earlier
const ACCOUNT = "act_1006870751067315";
const NAME = "CPS0526 | More than a haircut | Mass FB Reach | ฿1,000/7d Lifetime CBO";

const START = new Date(Date.now() + 5 * 60_000);
const END = new Date(START.getTime() + 7 * 24 * 60 * 60_000);

async function post(path: string, token: string, body: object) {
  const url = new URL(`https://graph.facebook.com/v23.0${path}`);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json()) as { id?: string; error?: { message: string } };
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  const conn = await prisma.metaConnection.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  const token = decrypt(conn.accessTokenEncrypted);

  console.log(`━━━ ${NAME} ━━━\n`);

  const camp = await post(`/${ACCOUNT}/campaigns`, token, {
    name: NAME,
    objective: "OUTCOME_AWARENESS",
    status: "PAUSED",
    special_ad_categories: [],
    buying_type: "AUCTION",
    lifetime_budget: "100000", // ฿1,000 = 100,000 satang
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });
  if (camp.error) { console.log("Campaign:", camp.error.message); return; }
  console.log(`✓ Campaign ${camp.id}`);

  const adset = await post(`/${ACCOUNT}/adsets`, token, {
    name: `${NAME} — Ad Set`,
    campaign_id: camp.id,
    status: "PAUSED",
    optimization_goal: "REACH",
    billing_event: "IMPRESSIONS",
    targeting: {
      geo_locations: { countries: ["TH"], location_types: ["home", "recent"] },
      age_min: 20,
      age_max: 60,
      publisher_platforms: ["facebook"],
      facebook_positions: ["feed", "facebook_reels", "profile_feed", "story"],
      targeting_automation: { advantage_audience: 0 },
    },
    start_time: START.toISOString(),
    end_time: END.toISOString(),
    multi_advertiser_ads: { state: "OPT_OUT" },
  });
  if (adset.error) { console.log("AdSet:", adset.error.message); return; }
  console.log(`✓ AdSet ${adset.id}`);

  const creative = await post(`/${ACCOUNT}/adcreatives`, token, {
    name: `${NAME} — Creative`,
    object_story_id: `${FB_PAGE_ID}_${FB_POST_ID}`,
  });
  if (creative.error) { console.log("Creative:", creative.error.message); return; }
  console.log(`✓ Creative ${creative.id}`);

  const ad = await post(`/${ACCOUNT}/ads`, token, {
    name: `${NAME} — Ad`,
    adset_id: adset.id,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });
  if (ad.error) { console.log("Ad:", ad.error.message); return; }
  console.log(`✓ Ad ${ad.id}`);

  console.log(`\n🎉 SUCCESS — campaign created PAUSED`);
  console.log(`\nVerify: https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1006870751067315&selected_campaign_ids=${camp.id}`);

  await prisma.$disconnect();
}
main().catch(console.error);
