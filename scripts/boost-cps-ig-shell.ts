/**
 * Build the IG-only campaign shell: Campaign + AdSet, no Ad.
 * User will pick the IG reel as creative in Ads Manager UI.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { decrypt } from "../src/lib/crypto/aes";

const ACCOUNT = "act_1006870751067315";
const NAME = "CPS0526 | More than a haircut | Mass IG Reach | ฿1,000/7d Lifetime CBO";

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
    lifetime_budget: "100000", // ฿1,000 in satang
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
      publisher_platforms: ["instagram"],
      instagram_positions: ["stream", "reels", "story", "explore", "explore_home"],
      targeting_automation: { advantage_audience: 0 },
    },
    start_time: START.toISOString(),
    end_time: END.toISOString(),
    multi_advertiser_ads: { state: "OPT_OUT" },
  });
  if (adset.error) { console.log("AdSet:", adset.error.message); return; }
  console.log(`✓ AdSet ${adset.id}`);

  console.log(`\n🎉 Shell ready (Campaign + AdSet, no Ad yet)`);
  console.log(`\nNext: open Ads Manager → คลิก campaign นี้ → AdSet → กด '+ สร้างโฆษณา'`);
  console.log(`     → เลือก 'ใช้โพสต์ที่มีอยู่' → pick IG reel @cps.label → Save`);
  console.log(`\n🔗 https://adsmanager.facebook.com/adsmanager/manage/adsets?act=1006870751067315&selected_campaign_ids=${camp.id}`);

  await prisma.$disconnect();
}
main().catch(console.error);
